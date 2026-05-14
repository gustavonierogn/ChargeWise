fetch('/menu/update', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => {
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
})
.then(data => {
    console.log('Dados recebidos do servidor:', data);
    document.getElementById('potenciaContratada').value = data.demandacontratada;
    document.getElementById('margemDeRisco').value = data.margem;
    document.getElementById('valorKwh').value = data.valorkwh;
})
.catch(error => console.error('Error:', error));

document.getElementById('settingsForm').addEventListener('submit', function(event) {
    event.preventDefault();

    var potenciaContratada = document.getElementById('potenciaContratada').value;
    var margem = document.getElementById('margemDeRisco').value;
    var valorKwh = document.getElementById('valorKwh').value;

    fetch('/menu/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ potenciaContratada, margem, valorKwh })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('Dados recebidos do servidor:', data);
        alert(data.message || 'Configurações salvas com sucesso!');
    })
    .catch(error => console.error('Error:', error));
});

document.getElementById('back').addEventListener('click', function(event) {
    fetch('/back', {
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
