import http from 'http';
import https from 'https';
import { shell } from 'electron';
import { db, Account } from './db';

// 默认内置可配置凭证
export const DEFAULT_GOOGLE_CLIENT_ID = '';
export const DEFAULT_GOOGLE_CLIENT_SECRET = '';

export interface GoogleAuthResult {
  email: string;
  name: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * 刷新获取有效的 Google Access Token
 */
export async function getFreshGoogleAccessToken(account: Account): Promise<string> {
  const now = Date.now();
  if (
    account.access_token &&
    account.token_expires_at &&
    account.token_expires_at > now + 60 * 1000
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error('未找到 Google Refresh Token，请重新授权登录');
  }

  const clientId = account.client_id || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = account.client_secret || DEFAULT_GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('未配置 Google Client ID 或 Client Secret');
  }

  const postData = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refresh_token,
    grant_type: 'refresh_token',
  }).toString();

  const tokenRes: any = await new Promise((resolve, reject) => {
    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(data.error_description || data.error || 'Token 刷新失败'));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  account.access_token = tokenRes.access_token;
  account.token_expires_at = Date.now() + (tokenRes.expires_in || 3600) * 1000;
  db.save();

  return tokenRes.access_token;
}

/**
 * 启动本地临时 HTTP 监听器并打开系统浏览器跳转至 Google 授权页面
 */
export async function startGoogleOAuthFlow(
  clientId: string,
  clientSecret: string
): Promise<GoogleAuthResult> {
  if (!clientId || !clientSecret) {
    throw new Error(
      '请先输入或配置 Google Cloud OAuth 客户端 ID (Client ID) 与客户端密钥 (Client Secret)'
    );
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    // 创建本地临时监听服务
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (reqUrl.pathname === '/oauth/callback') {
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding-top: 80px; background: #fff1f0;">
                  <h2 style="color: #cf1322;">❌ Google 授权被取消或失败</h2>
                  <p>${error}</p>
                  <p style="color: #888;">您可以关闭此窗口，返回 Mail Hub 客户端重试。</p>
                </body>
              </html>
            `);
            if (!resolved) {
              resolved = true;
              reject(new Error(`用户取消或授权失败: ${error}`));
            }
            server.close();
            return;
          }

          if (code) {
            // 返回友好的授权成功网页给用户浏览器
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding-top: 80px; background: #f6ffed;">
                  <h1 style="color: #389e0d; font-size: 40px; margin-bottom: 8px;">🎉 授权成功！</h1>
                  <h2 style="color: #262626; font-weight: 500;">Mail Hub 已成功连接到您的 Google 账号</h2>
                  <p style="color: #595959; font-size: 16px;">您现在可以安全关闭此浏览器标签页，返回 <strong>Mail Hub</strong> 桌面应用开始收发邮件。</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </body>
              </html>
            `);

            server.close();

            // 用 Authorization Code 换取 Access Token 和 Refresh Token
            const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
            const tokenPostData = new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }).toString();

            const tokenRes: any = await new Promise((resToken, rejToken) => {
              const tokenReq = https.request(
                'https://oauth2.googleapis.com/token',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(tokenPostData),
                  },
                },
                (response) => {
                  let raw = '';
                  response.on('data', (c) => (raw += c));
                  response.on('end', () => {
                    try {
                      const parsed = JSON.parse(raw);
                      if (response.statusCode === 200) {
                        resToken(parsed);
                      } else {
                        rejToken(
                          new Error(parsed.error_description || parsed.error || '获取 Token 失败')
                        );
                      }
                    } catch (err) {
                      rejToken(err);
                    }
                  });
                }
              );
              tokenReq.on('error', rejToken);
              tokenReq.write(tokenPostData);
              tokenReq.end();
            });

            // 获取用户邮箱与个人信息
            const userInfo: any = await new Promise((resUser, rejUser) => {
              https
                .get(
                  'https://www.googleapis.com/oauth2/v2/userinfo',
                  {
                    headers: {
                      Authorization: `Bearer ${tokenRes.access_token}`,
                    },
                  },
                  (userResp) => {
                    let userRaw = '';
                    userResp.on('data', (c) => (userRaw += c));
                    userResp.on('end', () => {
                      try {
                        resUser(JSON.parse(userRaw));
                      } catch (e) {
                        rejUser(e);
                      }
                    });
                  }
                )
                .on('error', rejUser);
            });

            if (!resolved) {
              resolved = true;
              resolve({
                email: userInfo.email,
                name: userInfo.name || userInfo.email,
                access_token: tokenRes.access_token,
                refresh_token: tokenRes.refresh_token,
                expires_in: tokenRes.expires_in || 3600,
              });
            }
          }
        }
      } catch (e: any) {
        if (!resolved) {
          resolved = true;
          reject(e);
        }
        server.close();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        return reject(new Error('无法启动本地 OAuth 接收服务'));
      }

      port = address.port;
      const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

      // 完整的 Google 邮件收发与身份范围
      const scope = [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ');

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent`;

      // 自动调起系统浏览器 (Chrome/Safari/Edge)
      shell.openExternal(authUrl);

      // 设置 2 分钟超时保护
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close();
          reject(new Error('授权超时，未在限定时间内完成 Google 网页授权'));
        }
      }, 120000);
    });

    let port = 0;
  });
}
