import http from 'node:http';

const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AeroCloud Container App</title>
            <style>
                body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; border: 1px solid #334155; }
                h1 { color: #38bdf8; font-size: 2rem; margin-bottom: 0.5rem; }
                p { color: #94a3b8; font-size: 1.1rem; }
                .status { display: inline-block; background: #10b981; color: #022c22; font-weight: bold; padding: 0.25rem 0.75rem; border-radius: 9999px; margin-top: 1rem; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🚀 AeroCloud Container Live!</h1>
                <p>Your containerized application is running smoothly on port ${port}.</p>
                <div class="status">🟢 HEALTHY & ROUTED</div>
            </div>
        </body>
        </html>
    `);
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
