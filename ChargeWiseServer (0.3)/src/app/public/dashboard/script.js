var totalPowerCtx = document.getElementById('totalPowerChart').getContext('2d');
var vehiclePowerCtx = document.getElementById('vehiclePowerChart').getContext('2d');

var arrayPot = [3,2,1];
var arrayVei = [4,5,6];
var arraydata = [10,20,30];


var totalPowerChart = new Chart(totalPowerCtx, {
    type: 'line',
    data: {
        labels: arraydata, //valores do eixo x (tempo)
        datasets: [{
            label: 'Potência Total Consumida (KW)',
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
            borderColor: 'red',
            fill: true,
            data: arrayPot //valores do eixo y (potência)
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

var vehiclePowerChart = new Chart(vehiclePowerCtx, {
    type: 'line',
    data: {
        labels: arraydata,
        datasets: [{
            label: 'Potência Consumida pelos Veículos (KW)',
            backgroundColor: 'rgba(0, 255, 0, 0.2)',
            borderColor: 'green',
            fill: true,
            data: arrayVei
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});


document.getElementById('logout').addEventListener('click', function(event) { 
    fetch('/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        else if (response.redirected) {
            window.location.href = response.url; // Forçar redirecionamento no cliente
        }
        return response.json();  // Processa a resposta como JSON

    })
    .catch(error => console.error('Error:', error));
});

document.getElementById('setup').addEventListener('click', function(event) { 
    fetch('/menu', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        else if (response.redirected) {
            window.location.href = response.url; // Forçar redirecionamento no cliente
        }
        return response.json();  // Processa a resposta como JSON
    })
    .catch(error => console.error('Error:', error));
});

var mqttStateOn = false;

function sendMqttCommand(command) {
    return fetch('/mqtt/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: command
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao enviar comando MQTT');
        }
        return response.json();
    });
}

document.getElementById('mqttSend').addEventListener('click', function(event) {
    var button = event.currentTarget;
    var command = mqttStateOn ? 'DESLIGAR' : 'LIGAR';
    var nextState = !mqttStateOn;

    sendMqttCommand(command)
    .then(data => {
        mqttStateOn = nextState;
        button.textContent = mqttStateOn ? 'Tomada (ON)' : 'Tomada (OFF)';
        alert(data.message || 'Comando MQTT enviado: ' + command);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Erro ao enviar o comando MQTT. Veja o console.');
    });
});

var socket = io();
    socket.on("valoresGrafico", (arg, callback) => {
    console.log(arg); // "world"
    totalPowerChart.data.labels = arg.data;
    totalPowerChart.data.datasets[0].data = arg.potenciaTotal;
    totalPowerChart.update();

    vehiclePowerChart.data.labels = arg.data;
    vehiclePowerChart.data.datasets[0].data = arg.potenciaPorVeiculo;
    vehiclePowerChart.update();

    //document.getElementById("batValue").style.height = arg+"%";
    //callback("got it");
});