// pais
var pais = 'Brésil'

console.log(`Vous habitez au ${pais}`)

if (pais == "Brésil") {
console.log(`Vous être Brésilien!` )
}

// idade
var idades = 20

console.log(`Vous avez ${idades} ans..`)

if (pais == "Brésil") {
if (Number.isInteger(idades)) {

if (idades < 16) {
    console.log("Vous ne pouvez pas voter!")
} else if((idades >= 16 && idades < 18) | idades >= 70) {
    console.log("Vote optionnel")
} else {
    console.log("Vote obrigatoire")
}
}
}
else {
    "Vous être étranger"
}
