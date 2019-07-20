// sua idade
function sua_idade() {
var in_input1 = document.getElementById('input_idade').value; //A

document.getElementById("res3").innerHTML = `Sua idade é de ${in_input1}`
}
    // funcao seu nome
    function seu_nome() {
        var in_input2 = document.getElementById('input_nome').value; //A
        
        document.getElementById("res1").innerHTML = `O nome do nadador é ${in_input2}`
        }  
    // funcao sua categoria
	function sua_categoria () {
	var in_input3 = document.getElementById('input_idade').value; 
	var status = ""
	switch (true) {
		case in_input3 >= 5 && in_input3 <= 7:
			var status = "Infantil A";
			break;
		case in_input3 >= 8 && in_input3 <= 10:
			var status = "Infantil B";
            break;
        case in_input3 >= 11 && in_input3 <= 13:
			var status = "Juvenil A";
			break;
		case in_input3 >= 14 && in_input3 <= 17:
			var status = "Juvenil B";
            break;
        case in_input3 >= 18:
			var status = "Adulto";
			break;
	}

	document.getElementById("res2").innerHTML = `Percente à categoria  ${status}`
	} 