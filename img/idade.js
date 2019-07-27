function verificar() {
    let data = new Date()
    let year = data.getFullYear()

    let anodig = document.getElementById("txtano").value
    let resultado = document.querySelector("div#res")

    if (anodig.value.length==0 || anodig > year) {
        alert("[ERRO] verifique os dados")
    } else {
    let genero = document.getElementsByTagName("foo").value
    let img = document.createAttribute("img")
    img.setAttribute("id", "foto")
    let idade = year - Number("anodig.value")

    if(genero[1].checked) {
    //add photos for males
    if (idade >=0 & idade < 10) {
        img.setAttribute('src', 'menino.png')
    } else if (idade >= 10 & idade < 18) {
        img.setAttribute('src', 'jovem_m.png')
    } else if (idade >= 18 & idade < 60) {
        img.setAttribute('src', 'adulto.png')
    } else if (idade >= 60) {
        img.setAttribute('src', 'idoso.png')
    }


    } 
    
    resultado.style.textAlign = 'center'
    resultado.innerHTML = `Sua idade é de ${idade}`
    resultado.appendChild(img)
    console.log(idade)
    }
}

