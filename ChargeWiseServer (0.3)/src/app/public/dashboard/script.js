var totalPowerCtx = document.getElementById('totalPowerChart').getContext('2d');

var timeFrameSelect = document.getElementById('timeFrameSelect');
var fullDataLabels = [];
var fullTotalPower = [];

var totalPowerChart = new Chart(totalPowerCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Potência Total Consumida (kW)',
            backgroundColor: 'rgba(31, 111, 235, 0.15)',
            borderColor: '#1f6feb',
            pointBackgroundColor: '#1f6feb',
            fill: true,
            tension: 0.35,
            data: []
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'kW'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Tempo'
                }
            }
        }
    }
});

function updateTotalPowerLabel(value) {
    var label = document.getElementById('totalPowerValue');
    label.textContent = value !== undefined && value !== null && value !== '' ? `${value} kW` : '0 kW';
}

function parseRawDate(rawDate) {
    if (!rawDate) return null;
    var normalized = rawDate.replace('-', ' ');
    var parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    var parts = rawDate.split('-');
    if (parts.length >= 2) {
        var datePart = parts.slice(1).join(' ');
        parsed = new Date(datePart);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

function getFilteredSeries(days) {
    if (!days || days <= 0) {
        return {
            labels: fullDataLabels.slice(),
            data: fullTotalPower.slice()
        };
    }

    var now = new Date();
    var cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    var filteredLabels = [];
    var filteredData = [];

    for (var i = 0; i < fullDataLabels.length; i++) {
        var dateItem = parseRawDate(fullDataLabels[i]);
        if (!dateItem) continue;
        if (dateItem >= cutoff) {
            filteredLabels.push(fullDataLabels[i]);
            filteredData.push(fullTotalPower[i]);
        }
    }

    if (!filteredLabels.length) {
        return {
            labels: fullDataLabels.slice(),
            data: fullTotalPower.slice()
        };
    }

    return {
        labels: filteredLabels,
        data: filteredData
    };
}

function applyTimeFrameFilter() {
    var days = Number(timeFrameSelect.value);
    var filtered = getFilteredSeries(days);
    totalPowerChart.data.labels = filtered.labels;
    totalPowerChart.data.datasets[0].data = filtered.data;
    totalPowerChart.update();

    var latestValue = filtered.data.length ? filtered.data[filtered.data.length - 1] : null;
    updateTotalPowerLabel(latestValue);
}

function formatMonthYear(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function buildMonthlyTable(records) {
    var tbody = document.querySelector('#monthlyConsumptionTable tbody');
    if (!records || !records.length) {
        tbody.innerHTML = '<tr><td colspan="3">Não há dados de consumo.</td></tr>';
        return;
    }

    var grouped = records.reduce(function(acc, item) {
        var parsedDate = parseRawDate(item.data);
        if (!parsedDate) return acc;
        var monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
        var value = Number(item.potenciatotal);
        if (Number.isNaN(value)) value = 0;

        if (!acc[monthKey]) {
            acc[monthKey] = {
                key: monthKey,
                date: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1),
                total: 0
            };
        }
        acc[monthKey].total += value;
        return acc;
    }, {});

    var rows = Object.values(grouped)
        .sort(function(a, b) { return b.date - a.date; })
        .slice(0, 12)
        .map(function(item) {
            return `
                <tr>
                    <td>${formatMonthYear(item.date)}</td>
                    <td>${item.total.toFixed(2)}</td>
                    <td>${item.total > 0 ? 'OK' : 'Sem consumo'}</td>
                </tr>
            `;
        });

    tbody.innerHTML = rows.join('') || '<tr><td colspan="3">Não há dados de consumo.</td></tr>';
}

async function loadMonthlyConsumption() {
    var tbody = document.querySelector('#monthlyConsumptionTable tbody');
    try {
        var response = await fetch('/api/table/potencia');
        if (!response.ok) {
            throw new Error('Falha ao buscar dados de consumo');
        }
        var records = await response.json();
        buildMonthlyTable(records);
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar dados.</td></tr>';
        console.error('Erro ao carregar consumo mensal:', error);
    }
}

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
            window.location.href = response.url;
        }
        return response.json();
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
            window.location.href = response.url;
        }
        return response.json();
    })
    .catch(error => console.error('Error:', error));
});

var mqttStateOn = false;

function sendMqttCommand(command) {
    return fetch('/mqtt/send', {
        method: 'POST',
        credentials: 'same-origin',
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
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Erro ao enviar o comando MQTT. Veja o console.');
    });
});

var connectionStatusElement = document.getElementById('connectionStatus');
var clockStatusElement = document.getElementById('clockStatus');
var connectionTimer = null;
var connectionTimeoutMs = 15000;
var powerFields = ['KwhTotal', 'potenciatotal', 'PotenciaTotal', 'potencia', 'potenciaTotal'];

function setConnectionStatus(connected) {
    if (!connectionStatusElement) return;
    var dot = connectionStatusElement.querySelector('.status-dot');
    var text = connectionStatusElement.querySelector('.status-text');
    if (connected) {
        dot.classList.remove('disconnected');
        dot.classList.add('connected');
        text.textContent = 'Conectado';
    } else {
        dot.classList.remove('connected');
        dot.classList.add('disconnected');
        text.textContent = 'Desconectado';
    }
}

function setClockStatus(connected) {
    if (!clockStatusElement) return;
    var dot = clockStatusElement.querySelector('.status-dot');
    var text = clockStatusElement.querySelector('.status-text');
    if (connected) {
        dot.classList.remove('disconnected');
        dot.classList.add('connected');
        text.textContent = 'Relógio conectado';
    } else {
        dot.classList.remove('connected');
        dot.classList.add('disconnected');
        text.textContent = 'Relógio desconectado';
    }
}

function hasClockPowerInfo(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return powerFields.some(function(field) {
        var value = payload[field];
        return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
    });
}

function updateClockStatus(payload) {
    if (!payload || typeof payload !== 'object') {
        return;
    }
    if (payload.error === 'RelogioDesconectado') {
        setClockStatus(false);
        return;
    }
    if (hasClockPowerInfo(payload)) {
        setClockStatus(true);
    }
}

function resetConnectionTimer() {
    clearTimeout(connectionTimer);
    setConnectionStatus(true);
    connectionTimer = setTimeout(function() {
        setConnectionStatus(false);
    }, connectionTimeoutMs);
}

var socket = io();

socket.on('valoresGrafico', function(arg) {
    fullDataLabels = Array.isArray(arg.data) ? arg.data.slice() : [];
    fullTotalPower = Array.isArray(arg.potenciaTotal) ? arg.potenciaTotal.slice() : [];
    applyTimeFrameFilter();
});

socket.on('devicePing', function(arg) {
    resetConnectionTimer();
    updateClockStatus(arg.payload);
});

timeFrameSelect.addEventListener('change', applyTimeFrameFilter);

window.addEventListener('DOMContentLoaded', function() {
    loadMonthlyConsumption();
    applyTimeFrameFilter();
    setConnectionStatus(false);
    setClockStatus(false);
});