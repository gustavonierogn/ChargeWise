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
    return response.json();  // Processa a resposta como JSON
})
.then(data => {
    console.log('Dados recebidos do servidor:', data);
    document.getElementById('potenciaContratada').value = data.demandacontratada;
    document.getElementById('margemDeRisco').value = data.margem;
  })
.catch(error => console.error('Error:', error));

document.getElementById('settingsForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const potenciaContratada = document.getElementById('potenciaContratada').value;
    const margemDeRisco = document.getElementById('margemDeRisco').value;

    fetch('/save-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ potenciaContratada, margemDeRisco })
    })
    .then(response => response.json())
    .then(data => alert('Configurações salvas com sucesso!'))
    .catch(error => console.error('Erro:', error));
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
            window.location.href = response.url; // Forçar redirecionamento no cliente
        }
        return response.json();  // Processa a resposta como JSON
    })
    .catch(error => console.error('Error:', error));
});

document.getElementById('save').addEventListener('click', function(event) { 
    var potenciaContratada = document.getElementById('potenciaContratada').value;
    var margem = document.getElementById('margemDeRisco').value;
    fetch('/menu/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ potenciaContratada, margem})
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
    .then(data => {
        console.log('Dados recebidos do servidor:', data);
      })
    .catch(error => console.error('Error:', error));
});