document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;
    
        fetch('/credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
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
