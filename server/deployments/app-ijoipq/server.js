import http from "node:http";

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
    });

    res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AeroCloud</title>

<style>
*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

body{
    font-family: Inter, system-ui, sans-serif;
    background:#020617;
    overflow:hidden;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:100vh;
    color:white;
}

body::before,
body::after{
    content:"";
    position:absolute;
    width:450px;
    height:450px;
    border-radius:50%;
    filter:blur(100px);
    opacity:.45;
    animation:float 10s ease-in-out infinite alternate;
}

body::before{
    background:#2563eb;
    top:-120px;
    left:-120px;
}

body::after{
    background:#06b6d4;
    bottom:-120px;
    right:-120px;
    animation-delay:3s;
}

.card{
    position:relative;
    z-index:1;
    width:min(90%,700px);
    padding:3rem;
    border-radius:24px;

    background:rgba(15,23,42,.72);
    backdrop-filter:blur(20px);

    border:1px solid rgba(255,255,255,.08);

    box-shadow:
        0 20px 60px rgba(0,0,0,.5),
        inset 0 1px rgba(255,255,255,.05);

    text-align:center;
}

.logo{
    width:90px;
    height:90px;
    margin:auto;
    border-radius:50%;

    display:flex;
    align-items:center;
    justify-content:center;

    background:linear-gradient(135deg,#38bdf8,#2563eb);

    font-size:2.5rem;

    box-shadow:0 0 40px rgba(56,189,248,.4);
}

h1{
    margin-top:1.6rem;
    font-size:2.5rem;
    letter-spacing:-1px;
}

.gradient{
    background:linear-gradient(90deg,#38bdf8,#22d3ee,#60a5fa);
    -webkit-background-clip:text;
    color:transparent;
}

.subtitle{
    margin-top:1rem;
    color:#cbd5e1;
    line-height:1.8;
    font-size:1.05rem;
}

.info{
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:1rem;
    margin-top:2rem;
}

.box{
    padding:1rem;
    border-radius:16px;
    background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.06);
}

.label{
    font-size:.85rem;
    color:#94a3b8;
    margin-bottom:.35rem;
}

.value{
    font-size:1.15rem;
    font-weight:600;
}

.status{
    display:inline-flex;
    align-items:center;
    gap:.6rem;

    margin-top:2rem;

    padding:.8rem 1.4rem;

    border-radius:999px;

    background:rgba(16,185,129,.12);
    border:1px solid rgba(16,185,129,.35);

    color:#34d399;
    font-weight:600;
}

.dot{
    width:10px;
    height:10px;
    border-radius:50%;
    background:#22c55e;
    box-shadow:0 0 15px #22c55e;
    animation:pulse 1.6s infinite;
}

footer{
    margin-top:2rem;
    color:#64748b;
    font-size:.9rem;
}

@keyframes pulse{
    0%{
        transform:scale(.8);
        opacity:.6;
    }

    50%{
        transform:scale(1.2);
        opacity:1;
    }

    100%{
        transform:scale(.8);
        opacity:.6;
    }
}

@keyframes float{
    from{
        transform:translateY(-30px);
    }

    to{
        transform:translateY(40px);
    }
}
</style>

</head>

<body>

<div class="card">

    <div class="logo">☁️</div>

    <h1>
        Welcome to
        <span class="gradient">AeroCloud</span>
    </h1>

    <p class="subtitle">
        Your container is deployed successfully and serving traffic.
        Everything is up, healthy, and ready to build something awesome.
    </p>

    <div class="info">

        <div class="box">
            <div class="label">Runtime</div>
            <div class="value">Node.js</div>
        </div>

        <div class="box">
            <div class="label">Listening Port</div>
            <div class="value">${port}</div>
        </div>

        <div class="box">
            <div class="label">Environment</div>
            <div class="value">${process.env.NODE_ENV || "Production"}</div>
        </div>

    </div>

    <div class="status">
        <span class="dot"></span>
        Healthy • Running • Routed
    </div>

    <footer>
        🚀 Powered by AeroCloud Containers
    </footer>

</div>

</body>
</html>
`);
});

server.listen(port, () => {
    console.log(process.env.He)
    
    setInterval(() => {
        console.log("Logging real time test - " + new Date().
            toLocaleTimeString());
    }, 1000);
    console.log(`🚀 AeroCloud server running on http://localhost:${port}`);
});