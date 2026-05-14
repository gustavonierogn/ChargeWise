const Sequelize = require('sequelize');

//para usar localhost no meu pc
const sequelize = new Sequelize('chargewise', 'root', 'guga1410', {
    host: "localhost",
    dialect: 'mysql'
});

/* const sequelize = new Sequelize('chargewise', 'chargewise', 'senhachargewise', {
    host: "localhost",
    dialect: 'mysql'
}); */

sequelize.authenticate().then(function(){
    console.log("Conectado no banco de dados com sucesso!");
}).catch(function(erro){
    console.log("Erro ao conectar no banco de dados:", erro);
});

module.exports = sequelize;