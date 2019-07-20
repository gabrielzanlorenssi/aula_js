var nome = prompt("Qual o seu nome?");
document.getElementById("nome").innerHTML = `Olá, ${nome}!`;

function imc_calc() {
var in_input1 = document.getElementById('input1').value; //A
var in_input2 = document.getElementById('input2').value; //P

var imc = in_input2 / Math.pow(in_input1, 2)
var imc = imc.toFixed(2)

document.getElementById("res1").innerHTML = `Seu IMC é de ${imc}`;
}
	// funcao peso_ideal
	function peso_ideal () {
		var in_altura = document.getElementById('input1').value;
		var ideal_min = in_altura * in_altura * 18.5;
		var ideal_min = ideal_min.toFixed(0);
		var ideal_max = in_altura * in_altura * 25;
		var ideal_max = ideal_max.toFixed(0);

	document.getElementById("res3").innerHTML = `Seu peso ideal está entre ${ideal_min}kg e ${ideal_max}kg`

	}
	// funcao imc_status
	function imc_status () {
	var in_input1 = document.getElementById('input1').value; 
	var in_input2 = document.getElementById('input2').value; 
	var imc = in_input2 / Math.pow(in_input1, 2)
	var status = ""
	switch (true) {
		case imc < 17:
			var status = "muito abaixo do peso";
			document.getElementById("res2").style.color = "red";
			break;
		case imc >= 17 && imc < 18.50:
			var status = "abaixo do peso";
			document.getElementById("res2").style.color = "orange";
			break;
		case imc >= 18.50 && imc < 25:
			var status = "com peso normal";
			document.getElementById("res2").style.color = "blue";
			break;
		case imc >= 25 && imc < 30:
			var status = "acima do peso";
			document.getElementById("res2").style.color = "orange";
            break;
        case imc >= 30 && imc < 35:
			var status = "acima do peso (obesidade)";
			document.getElementById("res2").style.color = "rgb(254,0,0)";
			break;
        case imc >= 35 && imc < 40:
			var status = "<strong>muito acima do peso (obesidade severa)</strong>";
			document.getElementById("res2").style.color = "rgb(154,0,0)";
            break;
        case imc >= 40:
			var status = "<strong>muito acima do peso (obesidade mórbida)</strong>"
			document.getElementById("res2").style.color = "rgb(104,0,0)";
	}

	document.getElementById("res2").innerHTML = `Você está ${status}`
	} 