import express from 'express';
import { Logger } from '../utils/logger.js';
import { generateApiKey, hashApiKey, saveUser } from '../config/db.js';
import { encryptAccessToken } from '../utils/security.js';

export function authRoutes(app: express.Express) {

    // GitHub OAuth route redirect to GitHub for authentication
    app.get('/auth/github', async (req, res) => {

        // Step 1: Redirect user to GitHub for authentication
        let cliPort: number | string = req.query.port as string || '3001'; // Get the cliPort from the query parameters

        // Step 2: Validate the cliPort to ensure it's a valid port number
        cliPort = parseInt(cliPort, 10);
        if (cliPort < 1024 || cliPort > 65535) {
            return res.status(400).send("Invalid port number. Please provide a port number between 1024 and 65535.");
        }

        const scopes = ['repo', 'admin:repo_hook', 'write:repo_hook', 'user:email'].join(' '); // Scopes for GitHub OAuth

        const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_REDIRECT_URI}&scope=${encodeURIComponent(scopes)}&state=${cliPort}`

        res.redirect(redirectUrl);

    })

    // GitHub OAuth callback route to handle the response from GitHub
    app.get('/auth/github/callback', async (req, res) => {

        // Step 1: Handle GitHub callback and exchange code for access token
        const code = req.query.code as string;// Code github send after user authorize the app
        const state = req.query.state as string;

        if (!code || !state) {
            res.status(400).send("Missing code or state in the callback");
            return;
        }

        // Step 2: Exchange the code for the access token
        try {
            // Preapre the payload for the token exchange
            const payload = {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.GITHUB_REDIRECT_URI,
            }

            const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json', // Ensure we get JSON response
                },
                body: JSON.stringify(payload)
            })

            const tokenData = await tokenResponse.json() as {
                access_token?: string
            };

            if (!tokenData.access_token) {
                Logger.error("Failed to retrieve access token from GitHub");
                res.status(400).send("Failed to retrieve access token from GitHub");
                return;
            }

            Logger.info("GitHub access token retrieved successfully");

            // Step 2.1: Get github user info using the access token
            const userRes = await fetch('https://api.github.com/user', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Aerocloud-Server' // Optional: Set a user agent for GitHub API requests
                }
            })


            const userData = await userRes.json() as { id: number, login: string, email: string | null };

            // Step 2.2: Get user email info using the access token
            let userEmail: string | null = userData.email || null; // Default to the email from the user data
            if (!userEmail) {
                try {
                    // If the email is not available in the user data, fetch the user's emails
                    const emailRes = await fetch('https://api.github.com/user/emails', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Aerocloud-Server' // Optional: Set a user agent for GitHub API requests
                        }
                    })
                    if (emailRes.ok) {
                        const emailData = await emailRes.json() as Array<{ email: string, primary: boolean, verified: boolean }>;
                        const primaryEmail = emailData.find(email => (email.primary && email.verified) || emailData[0]); // Fallback to the first email if no primary verified email is found
                        userEmail = primaryEmail?.email || null;
                    } else {
                        Logger.error(`Failed to retrieve user emails from GitHub. Status: ${emailRes.status}}`);
                    }
                } catch (emailErr) {
                    Logger.error(`Error occurred while fetching user emails from GitHub: ${emailErr}`);
                }
            }

            // Step 3: Generate a unique API key for the user and hash it save it in the database
            const apiKey = generateApiKey(); // Generate a random API key
            const hashedApiKey = hashApiKey(apiKey); // Hash the API key

            // Step 3.1: Encrypt the GitHub access token before saving it to the database
            const encryptedAccessToken = encryptAccessToken(tokenData.access_token); // Encrypt the access token

            // Step 3.2: Save the user info and hashed API key in the database
            saveUser(userData.id.toString(), userData.login, userEmail, hashedApiKey, encryptedAccessToken); // Save the user info and hashed API key in the database

            Logger.info(`GitHub user info retrieved: ${userData.login} (ID: ${userData.id}) (email: ${userEmail})`);

            // Step 4: Serve HTML to transfer the token to the CLI local port (state)
            res.send(`
        <html>
            <body style="font-family: sans-serif; text-align: center;     
  padding-top: 50px;">
                <h2>Authentication Successful! 🎉</h2>
                <p>You can close this window now.</p>
                <script>
                    // Pings local CLI server listener port
  
                    
  fetch('http://localhost:${parseInt(state, 10)}/callback?token=${tokenData.access_token}&apiKey=${apiKey}&username=${userData.login}')        
                        .then(() => {
                            window.close();
                        }).catch(err => console.error("CLI ping failed:",err));
                </script>
            </body>
        </html>
    `);


        } catch (err) {
            Logger.error(`Error occurred while handling GitHub callback: ${err}`);
            res.status(500).send("Internal Server Error");
        }
    })

}