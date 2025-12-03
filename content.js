// content.js
if (!document.getElementById("sales-coach-overlay")) {
  const overlay = document.createElement("div");
  overlay.id = "sales-coach-overlay";
  overlay.style.position = "fixed";
  overlay.style.bottom = "20px";
  overlay.style.right = "20px";
  overlay.style.width = "420px";
  overlay.style.height = "600px";
  overlay.style.backgroundColor = "#fff";
  overlay.style.zIndex = "999999";
  overlay.innerHTML = `<h3>🎯 Sales Call Coach</h3>
                       <button id="start">Démarrer</button>
                       <button id="stop">Arrêter</button>
                       <div id="advice"></div>`;
  document.body.appendChild(overlay);

  const startBtn = overlay.querySelector("#start");
  const stopBtn = overlay.querySelector("#stop");
  
  startBtn.onclick = () => console.log("Start clicked !");
  stopBtn.onclick = () => console.log("Stop clicked !");
}
