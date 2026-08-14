import express from 'express';
import { Logger } from '../utils/logger.js';

export function authRoutes(app: express.Express) {

    app.get('/auth/github', async (req, res) => {

        // Step 1: Redirect user to GitHub for authentication
        const cliPort = req.query.port as string || '3001'; // Get the cliPort from the query parameters

        const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_REDIRECT_URI}&scope=repo,write:repo_hook&state=${cliPort}`

        res.redirect(redirectUrl);

    })

    app.get('/auth/github/callback', async (req, res) => {

        // Step 1: Handle GitHub callback and exchange code for access token
        const code = req.query.code as string; // Code github send after user authorize the app
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


            // Step 3: Serve HTML to transfer the token to the CLI local port (state)
            // Serve HTML to transfer the token to the CLI local port (state)     
            res.send(`
        <html>
            <body style="font-family: sans-serif; text-align: center;     
  padding-top: 50px;">
                <h2>Authentication Successful! 🎉</h2>
                <p>You can close this window now.</p>
                <script>
                    // Pings local CLI server listener port
  
                    
  fetch('http://localhost:${state}/callback?token=${tokenData.access_token}')        
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