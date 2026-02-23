const { Voy } = require("voy-search");

const voy = new Voy({ embeddings: [] });
voy.add({
  embeddings: [{
    id: "test-1",
    title: "doc",
    url: "",
    embeddings: [0.1, 0.2, 0.3]
  }]
});

const results = voy.search([0.1, 0.2, 0.3], 1);
console.log("Results type:", typeof results);
console.log("Is array:", Array.isArray(results));
console.log("Keys:", Object.keys(results));
console.log("Results:", results);
