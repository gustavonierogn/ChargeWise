const Sequelize = require('sequelize');
const database = require('./db');

const tabelaPotencia = database.define('potencia', {
    potenciatotal: {
        type: Sequelize.STRING
    },
    potenciaporveiculo: {
        type: Sequelize.STRING
    },
    data: {
        type: Sequelize.STRING
    }
});

const tabelacConfiguracao = database.define('configuracoes', {
    demandacontratada: {
        type: Sequelize.STRING
    },
    margem: {
        type: Sequelize.STRING
    }
});

/* tabelaPotencia.create({
    potenciatotal: "13360",
    potenciaporveiculo: "1344",
    data: "23:19:37-05/05/2024"
}); */

/* tabela2.create({
    demandacontratada: "60000",
    margem: "20"
}); */

//tabelaPotencia.sync({force: true});

module.exports = {
    tabelaPotencia: tabelaPotencia,
    tabelacConfiguracao: tabelacConfiguracao
};