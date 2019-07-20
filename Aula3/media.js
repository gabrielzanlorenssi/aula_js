function calcular() {
    let n1 = document.getElementById("num1").value
    let n2 = document.getElementById("num2").value
    let media = (Number(n1) + Number(n2))/2

    if (media >= 0 && media < 5) {
        var situacao = "reprovado"
    } else if (media >= 5 && media < 7) {
        var situacao = "recuperação"
    } else if (media >= 7 && media <= 10) {
        var situacao = "aprovado"
    } else {
        var situacao = "algo errado na conta!"
    }

    document.querySelector("div#resultado").innerHTML =
     `A situação é: ${situacao}. <br>
      A nota é de: ${media.toFixed(1)}`
}
function limpar() {
    if(document.getElementById("num1").value != "") {
        document.getElementById("num1").value = ""
        document.getElementById("num2").value = ""
        document.querySelector("div#resultado").innerHTML = `O resultado é..`
    }
}
