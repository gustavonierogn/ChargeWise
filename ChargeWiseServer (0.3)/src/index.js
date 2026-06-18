require('dotenv').config();
const readLine = require('readline');
var awsIot = require('aws-iot-device-sdk');
const path =require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./models/tables');
const PDFDocument = require('pdfkit');

const secretKey = 'CHAVE_DE_TESTE';

const app = express();
const port = 3000;

app.use(express.static(__dirname + "/app/public"));
app.use('/Logo', express.static(path.join(__dirname, '../Logo')));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(cookieParser());

var http = require('http').Server(app);
var io = require('socket.io')(http);

var CLIENT_AWS_IOT_CORE;
const DEVICE_HEARTBEAT_TIMEOUT_MS = 75000;
let lastDevicePing = null;

let resposta = {
    dvcName: process.env.IOT_CLIENT_ID_1,
    status: {
        message: "Teste"
    }
}

async function AtualizaValores() {
    return db.tabelaPotencia.findAll({
        order: [['id', 'ASC']]
    })
    .then(dados => {
        // Ordenar por ID crescente para ter cronologia correta
        dados.sort((a, b) => a.id - b.id);
        
        // Extrair dados diários para o gráfico
        const arrayPotenciaTotal = dados.map(item => item.potenciatotal);
        const arrayPotenciaveiculo = dados.map(item => item.potenciaporveiculo);
        const arrayData = dados.map(item => item.data);

        // Calcular consumo mensal (diferença entre último valor do mês e último do mês anterior)
        const monthlyData = {};
        dados.forEach(record => {
            const dateStr = record.data;
            const parsedDate = parseDate(dateStr);
            if (!parsedDate) return;
            const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
            const value = parseFloat(record.potenciatotal) || 0;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { lastValue: value, date: parsedDate };
            } else {
                // Manter o último valor (máximo) de cada mês
                monthlyData[monthKey].lastValue = Math.max(monthlyData[monthKey].lastValue, value);
            }
        });

        // Converter para array ordenado
        const sortedMonths = Object.values(monthlyData)
            .sort((a, b) => a.date - b.date);

        // Calcular consumo mensal como diferença
        const monthlyConsumption = [];
        sortedMonths.forEach((month, index) => {
            if (index === 0) {
                // Primeiro mês: assumir que é consumo direto
                monthlyConsumption.push(month.lastValue);
            } else {
                // Demais meses: diferença entre mês atual e anterior
                const previousValue = sortedMonths[index - 1].lastValue;
                const consumption = month.lastValue >= previousValue
                    ? month.lastValue - previousValue
                    : month.lastValue;
                monthlyConsumption.push(consumption);
            }
        });

        const resultado = {
            potenciaTotal: arrayPotenciaTotal,
            potenciaPorVeiculo: arrayPotenciaveiculo,
            data: arrayData,
            monthlyConsumption: monthlyConsumption,
            monthlyLabels: sortedMonths.map(m => m.date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
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
        CLIENT_AWS_IOT_CORE.publish('srv2dvc/12345', JSON.stringify(resposta));
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
            lastDevicePing = { timestamp: new Date().toISOString(), payload: _payload };
            io.emit('devicePing', lastDevicePing);

            const powerFields = ['KwhTotal', 'potenciatotal', 'PotenciaTotal', 'potencia', 'potenciaTotal'];
            const hasPowerInfo = powerFields.some(field => {
                const value = _payload[field];
                if (value === null || value === undefined || value === '') {
                    return false;
                }
                return !Number.isNaN(Number(value));
            });

            if (hasPowerInfo) {
                let agora = new Date();
                const date = String(agora.toLocaleTimeString()) + "-" + String(agora.toDateString());

                await db.tabelaPotencia.create({
                    potenciatotal: JSON.stringify(_payload.KwhTotal ?? _payload.potenciatotal ?? _payload.potencia ?? _payload.potenciaTotal ?? _payload.PotenciaTotal),
                    potenciaporveiculo: JSON.stringify(_payload.KwhTotal ?? _payload.potenciatotal ?? _payload.potencia ?? _payload.potenciaTotal ?? _payload.PotenciaTotal),
                    data: date
                });
                await AtualizaValores();
            } else {
                console.log('Resposta do dvc ignorada: payload sem informações de potência válidas.', _payload);
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
    const { potenciaContratada, margem, valorKwh } = req.body;
    await ensureConfigValueColumn();
    let table = await db.tabelacConfiguracao.findByPk(1);

    if (!table) {
        table = await db.tabelacConfiguracao.create({
            id: 1,
            demandacontratada: 0,
            margem: 0,
            valorkwh: 0
        });
    }

    if (Number(potenciaContratada) > 0 && Number(margem) > 0 && Number(valorKwh) >= 0) {
        table.demandacontratada = potenciaContratada;
        table.margem = margem;
        table.valorkwh = valorKwh;
        await table.save();
        io.emit('configUpdated', { valorkwh: table.valorkwh });
        const data = {
            message: "Banco de dados atualizado",
            time: new Date().toISOString()
        };
        res.json(data);
    } else {
        const data = {
            message: "Verifique os dados",
            time: new Date().toISOString()
        };
        res.json(data);
    }

})

app.post('/menu/update', async (req, res) => {
    let table;

    try {
        await ensureConfigValueColumn();
        table = await db.tabelacConfiguracao.findByPk(1);
    } catch (error) {
        console.error('Erro ao preparar coluna valorkwh:', error);
        table = await db.tabelacConfiguracao.findByPk(1, {
            attributes: ['id', 'demandacontratada', 'margem']
        });
    }

    if (!table) {
        table = await db.tabelacConfiguracao.create({
            id: 1,
            demandacontratada: 0,
            margem: 0,
            valorkwh: 0
        });
    }

    const data = {
        demandacontratada: table.demandacontratada,
        margem: table.margem,
        valorkwh: table.valorkwh || '0'
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
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            sameSite: 'lax' // Permite o cookie em redirecionamentos do mesmo site
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

function hasValidToken(req) {
    const token = req.cookies.auth_token;
    if (!token) return false;

    try {
        jwt.verify(token, secretKey);
        return true;
    } catch (error) {
        return false;
    }
}

function clearAuthCookie(res) {
    res.cookie('auth_token', '', {
        expires: new Date(0),
        httpOnly: true,
        sameSite: 'lax'
    });
}

app.get('/dashboard', (req, res) => {
    if (hasValidToken(req)) {
        try {
            res.sendFile(path.join(__dirname, 'app/dashboard.html'));
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        clearAuthCookie(res);
        res.redirect('/login');
    }
})

app.get('/setup', async (req, res) => {
    if (hasValidToken(req)) {
        try {
            res.sendFile(path.join(__dirname, 'app/menu.html'));
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        clearAuthCookie(res);
        res.redirect('/login');
    }
})

app.get('/database', (req, res) => {
    if (hasValidToken(req)) {
        try {
            res.sendFile(path.join(__dirname, 'app/database-viewer.html'));
        } catch (error) {
            res.redirect('/login');
        }
    } else {
        clearAuthCookie(res);
        res.redirect('/login');
    }
})

// API Routes para visualizar banco de dados
app.get('/api/table/:tableName', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    const { tableName } = req.params;
    
    try {
        if (tableName === 'potencia') {
            const dados = await db.tabelaPotencia.findAll({ order: [['id', 'DESC']] });
            res.json(dados);
        } else if (tableName === 'configuracoes') {
            try {
                await ensureConfigValueColumn();
                const dados = await db.tabelacConfiguracao.findAll();
                res.json(dados);
            } catch (configError) {
                console.error('Erro ao buscar configuracoes com valorkwh:', configError);
                const dados = await db.tabelacConfiguracao.findAll({
                    attributes: ['id', 'demandacontratada', 'margem']
                });
                res.json(dados.map(item => ({
                    ...item.toJSON(),
                    valorkwh: '0'
                })));
            }
        } else {
            res.status(404).json({ message: 'Tabela não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        res.status(500).json({ message: 'Erro ao buscar dados' });
    }
})

app.put('/api/table/:tableName/:id', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    const { tableName, id } = req.params;
    const updates = req.body;

    try {
        if (tableName === 'potencia') {
            const record = await db.tabelaPotencia.findByPk(id);
            if (!record) {
                return res.status(404).json({ message: 'Registro não encontrado' });
            }
            await record.update(updates);
            await AtualizaValores();
            res.json({ message: 'Registro atualizado com sucesso', data: record });
        } else if (tableName === 'configuracoes') {
            await ensureConfigValueColumn();
            const record = await db.tabelacConfiguracao.findByPk(id);
            if (!record) {
                return res.status(404).json({ message: 'Registro não encontrado' });
            }
            await record.update(updates);
            io.emit('configUpdated', { valorkwh: record.valorkwh });
            res.json({ message: 'Registro atualizado com sucesso', data: record });
        } else {
            res.status(404).json({ message: 'Tabela não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao atualizar registro:', error);
        res.status(500).json({ message: 'Erro ao atualizar registro' });
    }
})

app.delete('/api/table/:tableName/:id', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    const { tableName, id } = req.params;

    try {
        if (tableName === 'potencia') {
            const record = await db.tabelaPotencia.findByPk(id);
            if (!record) {
                return res.status(404).json({ message: 'Registro não encontrado' });
            }
            await record.destroy();
            await AtualizaValores();
            res.json({ message: 'Registro deletado com sucesso' });
        } else if (tableName === 'configuracoes') {
            const record = await db.tabelacConfiguracao.findByPk(id);
            if (!record) {
                return res.status(404).json({ message: 'Registro não encontrado' });
            }
            await record.destroy();
            io.emit('configUpdated', { valorkwh: 0 });
            res.json({ message: 'Registro deletado com sucesso' });
        } else {
            res.status(404).json({ message: 'Tabela não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao deletar registro:', error);
        res.status(500).json({ message: 'Erro ao deletar registro' });
    }
})

app.post('/api/database/clear', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    const { senha } = req.body;
    const MASTER_PASSWORD = process.env.MASTER_PASSWORD;

    if (senha !== MASTER_PASSWORD) {
        return res.status(401).json({ message: 'Senha incorreta' });
    }

    try {
        // Deletar todos os registros das tabelas
        await db.tabelaPotencia.destroy({ where: {} });
        await db.tabelacConfiguracao.destroy({ where: {} });
        await AtualizaValores();
        io.emit('configUpdated', { valorkwh: 0 });

        console.log('Banco de dados foi completamente limpo em:', new Date().toISOString());
        
        res.json({ 
            message: 'Banco de dados limpo com sucesso! Todos os registros foram deletados.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao limpar banco de dados:', error);
        res.status(500).json({ message: 'Erro ao limpar banco de dados' });
    }
})

app.post('/api/database/seed-progressive', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    const { senha } = req.body;
    const MASTER_PASSWORD = process.env.MASTER_PASSWORD;

    if (MASTER_PASSWORD && senha !== MASTER_PASSWORD) {
        return res.status(401).json({ message: 'Senha incorreta' });
    }

    try {
        await db.tabelaPotencia.destroy({ where: {} });
        await seedProgressiveMonthlyData();
        await AtualizaValores();

        res.json({
            message: 'Banco de dados povoado com dados progressivos dos últimos 12 meses.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao semear banco de dados:', error);
        res.status(500).json({ message: 'Erro ao semear banco de dados' });
    }
});

// Rota de teste - PDF simples
app.get('/test-pdf', async (req, res) => {
    try {
        const doc = new PDFDocument();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="teste.pdf"');
        
        doc.pipe(res);
        
        doc.fontSize(25).text('Teste PDF Simples', 100, 100);
        doc.fontSize(12).text('Este é um PDF de teste para validar a geração.', 100, 150);
        doc.fontSize(12).text(`Data: ${new Date().toLocaleString('pt-BR')}`, 100, 180);
        
        doc.end();
        
    } catch (error) {
        console.error('Erro ao gerar PDF teste:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/export/invoice', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado' });
    }
    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    try {
        // Fetch all potencia data
        const records = await db.tabelaPotencia.findAll({ order: [['id', 'ASC']] });

        // Get config
        const config = await db.tabelacConfiguracao.findByPk(1);
        const demandaContratada = config ? parseFloat(config.demandacontratada) || 0 : 0;
        const margem = config ? parseFloat(config.margem) || 0 : 0;
        const valorKwh = config ? parseFloat(String(config.valorkwh || '0').replace(',', '.')) || 0 : 0;

        // Current date
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Previous month
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        // Group by month and get LAST value of each month (since it's cumulative)
        const monthlyData = {};
        records.forEach(record => {
            const dateStr = record.data;
            const parsedDate = parseDate(dateStr);
            if (!parsedDate) return;
            const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
            const value = parseFloat(record.potenciatotal) || 0;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { lastValue: value, date: parsedDate };
            } else {
                // Keep the maximum (last) value of each month
                monthlyData[monthKey].lastValue = Math.max(monthlyData[monthKey].lastValue, value);
            }
        });

        // Convert to sorted array
        const sortedMonths = Object.values(monthlyData)
            .sort((a, b) => a.date - b.date);

        // Calculate monthly consumption as difference (current month - previous month)
        const monthlyConsumptions = [];
        sortedMonths.forEach((month, index) => {
            if (index === 0) {
                monthlyConsumptions.push(month.lastValue);
            } else {
                const previousValue = sortedMonths[index - 1].lastValue;
                const consumption = month.lastValue >= previousValue
                    ? month.lastValue - previousValue
                    : month.lastValue;
                monthlyConsumptions.push(consumption);
            }
        });

        // Last 12 months
        const last12Months = [];
        for (let i = 11; i >= 0; i--) {
            const date = new Date(currentYear, currentMonth - i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthEntry = monthlyData[key];
            
            let consumption = 0;
            if (monthEntry) {
                const monthIndex = sortedMonths.findIndex(m => 
                    m.date.getFullYear() === date.getFullYear() && 
                    m.date.getMonth() === date.getMonth()
                );
                if (monthIndex >= 0) {
                    consumption = monthlyConsumptions[monthIndex];
                }
            }
            
            last12Months.push({
                month: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                consumption: consumption,
                value: consumption * valorKwh
            });
        }

        // Current month consumption
        const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const currentMonthEntry = monthlyData[currentKey];
        let currentConsumption = 0;
        if (currentMonthEntry) {
            const currentIndex = sortedMonths.findIndex(m => 
                m.date.getFullYear() === currentYear && 
                m.date.getMonth() === currentMonth
            );
            if (currentIndex >= 0) {
                currentConsumption = monthlyConsumptions[currentIndex];
            }
        }

        // Previous month consumption
        const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
        const prevMonthEntry = monthlyData[prevKey];
        let prevConsumption = 0;
        if (prevMonthEntry) {
            const prevIndex = sortedMonths.findIndex(m => 
                m.date.getFullYear() === prevYear && 
                m.date.getMonth() === prevMonth
            );
            if (prevIndex >= 0) {
                prevConsumption = monthlyConsumptions[prevIndex];
            }
        }

        // Difference
        const difference = currentConsumption - prevConsumption;
        const currentConsumptionValue = currentConsumption * valorKwh;

        // Invoice value calculation
        let invoiceValue = 0;
        if (currentConsumption > demandaContratada) {
            const excess = currentConsumption - demandaContratada;
            invoiceValue = excess * (margem / 100);
        }

        // Create PDF with PDFKit
        const doc = new PDFDocument();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="fatura.pdf"');
        
        doc.pipe(res);

        // Title
        doc.fontSize(20).text('Fatura de Energia - EnerSplit', 50, 50);
        doc.fontSize(10).text(new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), 50, 75);

        // Info Section
        doc.fontSize(12).font('Helvetica-Bold').text('Informações da Fatura', 50, 110);
        doc.fontSize(11).font('Helvetica');
        
        const infoY = 135;
        const lineHeight = 20;
        
        doc.text(`Consumo do Mês Atual: ${currentConsumption.toFixed(2)} kWh`, 50, infoY);
        doc.text(`Demanda Contratada: ${demandaContratada.toFixed(2)} kWh`, 50, infoY + lineHeight);
        doc.text(`Valor do kWh: R$ ${valorKwh.toFixed(2)}`, 50, infoY + lineHeight * 2);
        doc.font('Helvetica-Bold').text(`Valor do Consumo Atual: R$ ${currentConsumptionValue.toFixed(2)}`, 50, infoY + lineHeight * 3);

        // Table Section
        doc.fontSize(12).font('Helvetica-Bold').text('Consumo dos Últimos 12 Meses', 50, infoY + lineHeight * 5);

        // Table headers
        const tableTop = infoY + lineHeight * 6;
        const periodColWidth = 220;
        const consumptionColWidth = 120;
        const valueColWidth = 120;
        
        doc.font('Helvetica-Bold').fontSize(10);
        doc.rect(50, tableTop, periodColWidth, 20).fillAndStroke('lightblue', 'black');
        doc.rect(50 + periodColWidth, tableTop, consumptionColWidth, 20).fillAndStroke('lightblue', 'black');

        doc.rect(50 + periodColWidth + consumptionColWidth, tableTop, valueColWidth, 20).fillAndStroke('lightblue', 'black');
        doc.fillColor('black');
        doc.text('Periodo', 55, tableTop + 5, { width: periodColWidth - 10 });
        doc.text('Consumo (kWh)', 55 + periodColWidth, tableTop + 5, { width: consumptionColWidth - 10 });
        doc.text('Valor (R$)', 55 + periodColWidth + consumptionColWidth, tableTop + 5, { width: valueColWidth - 10 });

        // Table rows
        doc.font('Helvetica').fontSize(10);
        let rowY = tableTop + 20;
        
        last12Months.forEach((item, index) => {
            doc.fillColor('black');
            doc.rect(50, rowY, periodColWidth, 18).stroke('gray');
            doc.text(item.month, 55, rowY + 2, { width: periodColWidth - 10 });
            
            doc.rect(50 + periodColWidth, rowY, consumptionColWidth, 18).stroke('gray');
            doc.text(item.consumption.toFixed(2), 55 + periodColWidth, rowY + 2);

            doc.rect(50 + periodColWidth + consumptionColWidth, rowY, valueColWidth, 18).stroke('gray');
            doc.text(`R$ ${item.value.toFixed(2)}`, 55 + periodColWidth + consumptionColWidth, rowY + 2);
            
            rowY += 18;
        });

        // Footer
        doc.fontSize(9).fillColor('gray');
        doc.text('Documento gerado automaticamente pelo sistema EnerSplit', 50, rowY + 20);
        doc.text(new Date().toLocaleString('pt-BR'), 50, rowY + 35);

        doc.end();

    } catch (error) {
        console.error('Erro geral na rota de fatura:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                message: 'Erro ao gerar fatura',
                error: error.message 
            });
        }
    }
});

function parseDate(dateStr) {
    if (!dateStr) return null;
    const normalized = dateStr.replace('-', ' ');
    let parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
        const datePart = parts.slice(1).join(' ');
        parsed = new Date(datePart);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}


async function ensureDatabaseTables() {
    try {
        await db.tabelaPotencia.sync();
        await db.tabelacConfiguracao.sync();
        await ensureConfigValueColumn();
        console.log('Tabelas `potencia` e `configuracoes` foram sincronizadas com sucesso.');
    } catch (error) {
        console.error('Erro ao sincronizar tabelas do banco de dados:', error);
        throw error;
    }
}

async function ensureConfigValueColumn() {
    const queryInterface = db.tabelacConfiguracao.sequelize.getQueryInterface();
    const tableName = db.tabelacConfiguracao.getTableName();
    const columns = await queryInterface.describeTable(tableName);

    if (!columns.valorkwh) {
        await queryInterface.addColumn(tableName, 'valorkwh', {
            type: db.tabelacConfiguracao.rawAttributes.valorkwh.type,
            allowNull: true,
            defaultValue: '0'
        });
        console.log('Coluna `valorkwh` adicionada na tabela `configuracoes`.');
    }
}

async function seedProgressiveMonthlyData() {
    const count = await db.tabelaPotencia.count();
    if (count > 0) {
        console.log('Dados ja existem no banco; seed progressivo nao foi executado.');
        return;
    }

    const now = new Date();
    const baseline = 10000;
    const monthlyIncrements = [520, 480, 510, 530, 490, 550, 600, 520, 560, 580, 610, 630];
    const records = [];
    let cumulativeValue = baseline;

    const baselineDate = new Date(now.getFullYear(), now.getMonth() - 11, 0, 23, 59, 59);
    records.push({
        potenciatotal: String(cumulativeValue),
        potenciaporveiculo: String(cumulativeValue),
        data: `${baselineDate.toLocaleTimeString('pt-BR')}-${baselineDate.toDateString()}`
    });

    for (let i = 0; i < 12; i++) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        const measurementDays = [5, 12, 19, lastDay];
        const incrementParts = [0.22, 0.26, 0.24, 0.28];

        measurementDays.forEach((day, index) => {
            cumulativeValue += monthlyIncrements[i] * incrementParts[index];
            const measurementDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 8 + index * 3, 0, 0);
            const value = Number(cumulativeValue.toFixed(2));
            const dateString = `${measurementDate.toLocaleTimeString('pt-BR')}-${measurementDate.toDateString()}`;

            records.push({
                potenciatotal: String(value),
                potenciaporveiculo: String(value),
                data: dateString
            });
        });
    }

    await db.tabelaPotencia.bulkCreate(records);
    console.log('Banco de dados populado com multiplas medidas progressivas por mes nos ultimos 12 meses.');
}
io.on('connection', async (socket) => {
    console.log('a user is connected in socket');
    AtualizaValores();

    if (lastDevicePing) {
        const heartbeatAge = Date.now() - new Date(lastDevicePing.timestamp).getTime();
        if (heartbeatAge < DEVICE_HEARTBEAT_TIMEOUT_MS) {
            socket.emit('devicePing', lastDevicePing);
        }
    }
})

async function startServer() {
    try {
        await ensureDatabaseTables();
        await seedProgressiveMonthlyData();
        var server = http.listen(port, () => {
            console.log('server is running on port', server.address().port);
            conectaAWS();
        });
    } catch (error) {
        console.error('Falha na inicialização do servidor:', error);
        process.exit(1);
    }
}

startServer();
