const Sequelize = require('sequelize');
const sequelize = new Sequelize('chargewise', 'root', 'guga1410', {
    host: "localhost",
    dialect: 'mysql'
});

sequelize.authenticate().then(function(){
    console.log("Conectado no banco de dados com sucesso!");
}
).catch(function(erro){
    console.log("Erro ao conectar no banco de dados:", erro);
})

module.exports = sequelize