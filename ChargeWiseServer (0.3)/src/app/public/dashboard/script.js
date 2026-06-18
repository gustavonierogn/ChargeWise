var totalPowerCtx = document.getElementById('totalPowerChart').getContext('2d');

var timeFrameSelect = document.getElementById('timeFrameSelect');
var fullDataLabels = [];
var fullTotalPower = [];
var fullMonthlyConsumptionLabels = [];
var fullMonthlyConsumptionData = [];
var kwhValueInReais = 0;

var totalPowerChart = new Chart(totalPowerCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Consumo Mensal (kWh)',
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
                    text: 'kWh'
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

function parseConfigNumber(value) {
    if (value === undefined || value === null || value === '') return 0;
    var normalized = String(value).replace(',', '.');
    var parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function updateTotalPowerLabel(value, unit) {
    var label = document.getElementById('totalPowerValue');
    var suffix = unit || 'kWh';
    if (value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value))) {
        var numericValue = Number(value);
        var consumedValue = numericValue * kwhValueInReais;
        label.textContent = `${numericValue.toFixed(2)} ${suffix} - ${formatCurrency(consumedValue)}`;
        return;
    }
    label.textContent = `0 ${suffix} - ${formatCurrency(0)}`;
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

function formatChartDate(rawDate) {
    var parsedDate = parseRawDate(rawDate);
    if (!parsedDate) return rawDate;

    var day = String(parsedDate.getDate()).padStart(2, '0');
    var month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    var year = String(parsedDate.getFullYear()).slice(-2);

    return `${day}/${month}/${year}`;
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
    var monthsToShow = Number(timeFrameSelect.value);

    var labels = fullMonthlyConsumptionLabels.slice(-monthsToShow);
    var data = fullMonthlyConsumptionData.slice(-monthsToShow);

    totalPowerChart.data.labels = labels;
    totalPowerChart.data.datasets[0].data = data;
    totalPowerChart.update();
}

function formatMonthYear(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function buildMonthlyConsumptionSeries(records) {
    if (!records || !records.length) {
        return [];
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
                lastValue: value
            };
        } else {
            acc[monthKey].lastValue = Math.max(acc[monthKey].lastValue, value);
        }
        return acc;
    }, {});

    var allMonths = Object.values(grouped)
        .sort(function(a, b) { return b.date - a.date; });

    return allMonths.map(function(item, index) {
        var monthlyConsumption;
        if (index < allMonths.length - 1) {
            var previousValue = allMonths[index + 1].lastValue;
            monthlyConsumption = item.lastValue >= previousValue
                ? item.lastValue - previousValue
                : item.lastValue;
        } else {
            monthlyConsumption = item.lastValue;
        }

        return {
            date: item.date,
            consumption: monthlyConsumption
        };
    });
}

function buildMonthlyTable(records) {
    var tbody = document.querySelector('#monthlyConsumptionTable tbody');
    var monthlySeries = buildMonthlyConsumptionSeries(records);

    if (!monthlySeries.length) {
        updateTotalPowerLabel(0);
        tbody.innerHTML = '<tr><td colspan="4">Nao ha dados de consumo.</td></tr>';
        return;
    }

    var sortedMonths = monthlySeries.slice(0, 12);
    updateTotalPowerLabel(sortedMonths[0].consumption);

    var rows = sortedMonths.map(function(item) {
        var monthlyConsumption = item.consumption;
        var monthlyValue = monthlyConsumption * kwhValueInReais;

        return `
            <tr>
                <td>${formatMonthYear(item.date)}</td>
                <td>${monthlyConsumption.toFixed(2)}</td>
                <td>${formatCurrency(monthlyValue)}</td>
                <td>${monthlyConsumption > 0 ? 'OK' : 'Sem consumo'}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('') || '<tr><td colspan="4">Nao ha dados de consumo.</td></tr>';
}

function renderMonthlyTableFromSocket(labels, values) {
    var tbody = document.querySelector('#monthlyConsumptionTable tbody');
    var rows = [];

    for (var i = labels.length - 1; i >= 0 && rows.length < 12; i--) {
        var monthlyConsumption = Number(values[i]);
        if (Number.isNaN(monthlyConsumption)) monthlyConsumption = 0;
        var monthlyValue = monthlyConsumption * kwhValueInReais;

        rows.push(`
            <tr>
                <td>${labels[i]}</td>
                <td>${monthlyConsumption.toFixed(2)}</td>
                <td>${formatCurrency(monthlyValue)}</td>
                <td>${monthlyConsumption > 0 ? 'OK' : 'Sem consumo'}</td>
            </tr>
        `);
    }

    if (values.length) {
        updateTotalPowerLabel(values[values.length - 1]);
    } else {
        updateTotalPowerLabel(0);
    }

    tbody.innerHTML = rows.join('') || '<tr><td colspan="4">Nao ha dados de consumo.</td></tr>';
}

async function loadMonthlyConsumption() {
    var tbody = document.querySelector('#monthlyConsumptionTable tbody');
    try {
        try {
            var configResponse = await fetch('/api/table/configuracoes');
            if (configResponse.ok) {
                var configs = await configResponse.json();
                var config = Array.isArray(configs) && configs.length ? configs[0] : {};
                kwhValueInReais = parseConfigNumber(config.valorkwh);
            } else {
                kwhValueInReais = 0;
                console.error('Erro ao carregar valor do kWh:', configResponse.status);
            }
        } catch (configError) {
            kwhValueInReais = 0;
            console.error('Erro ao carregar valor do kWh:', configError);
        }

        var response = await fetch('/api/table/potencia');
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (!response.ok) {
            throw new Error('Falha ao buscar dados de consumo');
        }
        var records = await response.json();
        buildMonthlyTable(records);
        var monthlySeries = buildMonthlyConsumptionSeries(records).slice(0, 12).reverse();
        fullMonthlyConsumptionLabels = monthlySeries.map(function(item) {
            return formatMonthYear(item.date);
        });
        fullMonthlyConsumptionData = monthlySeries.map(function(item) {
            return item.consumption;
        });
        applyTimeFrameFilter();
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar dados.</td></tr>';
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

document.getElementById('exportInvoice').addEventListener('click', function(event) {
    window.open('/export/invoice', '_blank');
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
        button.textContent = mqttStateOn ? 'Tomada (OFF)' : 'Tomada (ON)';
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Erro ao enviar o comando MQTT. Veja o console.');
    });
});

var connectionStatusElement = document.getElementById('connectionStatus');
var clockStatusElement = document.getElementById('clockStatus');
var connectionTimer = null;
// O dispositivo envia heartbeat a cada 30 s. Dois ciclos mais uma margem
// evitam oscilações por pequenos atrasos de rede ou processamento.
var connectionTimeoutMs = 75000;
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

function resetConnectionTimer(timestamp) {
    clearTimeout(connectionTimer);

    var heartbeatTime = timestamp ? new Date(timestamp).getTime() : Date.now();
    if (Number.isNaN(heartbeatTime)) heartbeatTime = Date.now();
    var remainingTime = connectionTimeoutMs - Math.max(0, Date.now() - heartbeatTime);

    if (remainingTime <= 0) {
        setConnectionStatus(false);
        setClockStatus(false);
        return;
    }

    setConnectionStatus(true);
    connectionTimer = setTimeout(function() {
        setConnectionStatus(false);
        setClockStatus(false);
    }, remainingTime);
}

var socket = io();

socket.on('valoresGrafico', function(arg) {
    fullDataLabels = Array.isArray(arg.data) ? arg.data.slice() : [];
    fullTotalPower = Array.isArray(arg.potenciaTotal) ? arg.potenciaTotal.slice() : [];
    fullMonthlyConsumptionLabels = Array.isArray(arg.monthlyLabels) ? arg.monthlyLabels.slice() : [];
    fullMonthlyConsumptionData = Array.isArray(arg.monthlyConsumption) ? arg.monthlyConsumption.map(Number) : [];

    applyTimeFrameFilter();
    renderMonthlyTableFromSocket(fullMonthlyConsumptionLabels, fullMonthlyConsumptionData);
});

socket.on('devicePing', function(arg) {
    resetConnectionTimer(arg.timestamp);
    updateClockStatus(arg.payload);
});

socket.on('disconnect', function() {
    clearTimeout(connectionTimer);
    setConnectionStatus(false);
    setClockStatus(false);
});

socket.on('configUpdated', function(arg) {
    kwhValueInReais = parseConfigNumber(arg && arg.valorkwh);
    renderMonthlyTableFromSocket(fullMonthlyConsumptionLabels, fullMonthlyConsumptionData);
});

timeFrameSelect.addEventListener('change', applyTimeFrameFilter);

window.addEventListener('DOMContentLoaded', function() {
    loadMonthlyConsumption();
    applyTimeFrameFilter();
});
