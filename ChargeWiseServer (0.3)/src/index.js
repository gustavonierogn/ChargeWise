require('dotenv').config();
const readLine = require('readline');
var awsIot = require('aws-iot-device-sdk');
const path =require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./models/tables');

const secretKey = 'CHAVE_DE_TESTE';

const app = express();
const port = 3000;

app.use(express.static(__dirname + "/app/public"));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(cookieParser());

var http = require('http').Server(app);
var io = require('socket.io')(http);

var CLIENT_AWS_IOT_CORE;

let resposta = {
    dvcName: process.env.IOT_CLIENT_ID_1,
    status: {
        message: "Teste"
    }
}

function AtualizaValores() {
    const table = db.tabelaPotencia.findAll({
        limit: 30,
        order: [['id', 'DESC']]
    })
    .then(dados => {
        dados.sort((a, b) => a.id - b.id);
        // Extrai apenas o 'potenciatotal' para o array
        const arrayPotenciaTotal = dados.map(item => item.potenciatotal);
        const arrayPotenciaveiculo = dados.map(item => item.potenciaporveiculo);
        const arrayData = dados.map(item => item.data);

        const resultado = {
            potenciaTotal: arrayPotenciaTotal,
            potenciaPorVeiculo: arrayPotenciaveiculo,
            data: arrayData
        };

        //console.log(resultado);

        io.emit("valoresGrafico", resultado, async (response) => {});
        
      })
    .catch(error => {
    console.error('Erro ao buscar os dados:', error);
    });
}

function conectaAWS() { 

    CLIENT_AWS_IOT_CORE = awsIot.device({
        clientId: process.env.IOT_CLIENT_ID_1,
        host: process.env.IOT_HOST,
        port: process.env.IOT_PORT,
        keyPath: process.env.IOT_KEY_PATH_1,
        certPath: process.env.IOT_CERT_PATH_1,
        caPath: process.env.IOT_CA_PATH
    });


    CLIENT_AWS_IOT_CORE.on('connect', async function() {
        console.log("Aws 1 connect!");
        CLIENT_AWS_IOT_CORE.subscribe('dvc2srv/12345');
        CLIENT_AWS_IOT_CORE.publish('dvc2srv/12345', JSON.stringify(resposta));
    });

    CLIENT_AWS_IOT_CORE.on('error', function (topic, payload) {
        console.log('Error:', topic, payload)
    });

    CLIENT_AWS_IOT_CORE.on('close', function (topic, payload) {
        console.log('Close:', topic, payload)
        conexaoAWS1 = false;
    });

    CLIENT_AWS_IOT_CORE.on('message', async function(topic, payload) {
        if(('dvc2srv/12345').localeCompare(topic) == 0) {
            let _payload;
            try {
                const raw = payload.toString();
                const sanitized = raw.replace(/\b(?:nan|NaN)\b/g, 'null');
                _payload = JSON.parse(sanitized);
            } catch (parseError) {
                console.error('Erro ao parsear payload MQTT:', parseError, payload.toString());
                return;
            }

            console.log("Resposta do dvc: ",  _payload);
            if(_payload.Corrente1 !== null && _payload.Corrente2 !== null) {
                let agora = new Date();
                const date = String(agora.toLocaleTimeString())+"-"+String(agora.toDateString());
                db.tabelaPotencia.create({
                    potenciatotal: JSON.stringify(_payload.KwhTotal),
                    potenciaporveiculo: JSON.stringify(_payload.KwhTotal),
                    data: date
                });
                //db.tabelaPotencia.sync({force: true});
                AtualizaValores();
            }
        }
    }); 
}

app.post('/back', (req, res) => {
    res.redirect('/dashboard');
})

app.post('/menu', (req, res) => {
    res.redirect('/setup');
})

app.post('/menu/save', async (req, res) => {
    const { potenciaContratada, margem } = req.body;
    const table = await db.tabelacConfiguracao.findByPk(1);
    if(potenciaContratada > 0 && margem > 0) {
        table.demandacontratada = potenciaContratada;
        table.margem = margem;
        await table.save();
        const data = {
            message: "Banco de dados atualizado",
            time: new Date().toISOString()
        };
        res.json(data);
    }
    else {
        const data = {
            message: "Verifique os dados",
            time: new Date().toISOString()
        };
        res.json(data);
    }

})

app.post('/menu/update', async (req, res) => {
    const table = await db.tabelacConfiguracao.findByPk(1);
    const data = {
        demandacontratada: table.demandacontratada,
        margem: table.margem
    };
    res.json(data);
})

app.post('/credentials', (req, res) => {
    const { username, password } = req.body;  // Extraia var1 e var2 do corpo da requisição
    console.log(`Recebido var1: ${username}, var2: ${password}`);
    if(username == 'user' && password == '12345') {
        const user = { id: 1, username: "user" };
        const token = jwt.sign({ user: user.id }, secretKey, { expiresIn: '1h' });
        res.cookie('auth_token', token, {
            httpOnly: true,  // O cookie não é acessível via JavaScript no navegador (prevenção contra XSS)
            secure: true,   // O cookie só é enviado em requisições HTTPS (prevenção contra ataques de tipo man-in-the-middle)
            sameSite: 'strict' // O cookie não é enviado em requisições cross-site
        });
        res.redirect('/dashboard');
    }
    else {
        const data = {
            message: "login incorreto",
            time: new Date().toISOString()
        };
        res.json(data);
    }
});

app.post('/mqtt/send', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    if (!CLIENT_AWS_IOT_CORE) {
        return res.status(500).json({ message: 'Conexão MQTT não estabelecida' });
    }

    const { command } = req.body || {};
    const payload = {
        command: command || 'ATUALIZAR_STATUS',
        timestamp: new Date().toISOString()
    };

    const topic = 'srv2dvc/12345';
    CLIENT_AWS_IOT_CORE.publish(topic, JSON.stringify(payload), (err) => {
        if (err) {
            console.error('Erro ao publicar MQTT:', err);
            return res.status(500).json({ message: 'Falha ao enviar comando MQTT' });
        }

        console.log('Comando MQTT publicado em', topic, payload);
        res.json({ message: 'Comando MQTT enviado com sucesso', topic });
    });
});

app.post('/logout', (req, res) => {
    // Definir o cookie 'auth_token' para expirar imediatamente
    res.cookie('auth_token', '', { 
        expires: new Date(0),  // Data de expiração no passado
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
    });
    res.redirect('/login'); 
});

app.get('/', (req, res) => {
    const token = req.cookies.auth_token;  // Acessar o token do cookie
    if (token) {
        try {
            const decoded = jwt.verify(token, secretKey);
            res.redirect('/dashboard');
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'app/login.html'));
})

app.get('/dashboard', (req, res) => {
    const token = req.cookies.auth_token;  // Acessar o token do cookie
    if (token) {
        try {
            res.sendFile(path.join(__dirname, 'app/dashboard.html'));
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        res.redirect('/login');
    }
})

app.get('/setup', async (req, res) => {
    const token = req.cookies.auth_token;  // Acessar o token do cookie
    if (token) {
        try {
            res.sendFile(path.join(__dirname, 'app/menu.html'));
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        res.redirect('/login');
    }
})



io.on('connection', async () =>{
    console.log('a user is connected in socket')
    AtualizaValores();
})

var server = http.listen(port, () => {
    console.log('server is running on port', server.address().port);
    conectaAWS();
});