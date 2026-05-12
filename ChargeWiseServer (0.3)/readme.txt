Informações adicionais de código (este arquivo é apenas uma base)

Formato do arquivo dados.txt que contém as informações de número de série, device ID e tópicos:
{dvcName: "cofre_2", category: "cofre_mobile", numSerie: "1210000004", topico_dvc2srv: "dvc2srv/cofre_2", topico_srv2dvc: "srv2dvc/cofre_2"}


Pacote básico de comandos baseado em JSON:
Tópico: srv2dvc (Servidor para Dispositivo)
{
    dvcName: "i0v-dva-ívnpnvsda",
    category: "cofre mobile",
    userId: "----------",
    cmd: {
        open: 1
    },
    config: {
        codigo: {
            id: 1,
            senha: 187231
        }
    },
    status: ["lockStatus", "doorStatus"]
}

Tópico: dvc2srv (Dispositivo para Servidor)
{
    dvcName: "i0v-dva-ívnpnvsda",
    category: "cofre mobile",
    userId: "----------",
    status: {
        lockStatus: "open",
        doorStatus: "close",
        message: 1
    },
    error: "errorType"
}

returnMQTT = "{\"dvcName\": \"";
returnMQTT += DEVICENAME;
returnMQTT += "\", \"userId\": \"";
returnMQTT += _userId;
returnMQTT += "\", \"status\": {\"lockStatus\": \"open\", \"message\": {\"title\": \"Cofre Aberto!\", \"body\": \"Seu cofre foi aberto com sucesso!\"}}}";
enviarMQTT(returnMQTT);