const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const hostInput = document.getElementById("host");
const saveBtn = document.getElementById("save");

browser.storage.local.get(["enabled", "host"]).then((data) => {
	const enabled = data.enabled !== false;
	toggle.checked = enabled;
	hostInput.value = data.host || "https://better-hub.com";
	updateStatus(enabled);
});

toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	browser.runtime.sendMessage({ type: "toggle", enabled }).then(() => {
		updateStatus(enabled);
	});
});

saveBtn.addEventListener("click", () => {
	const host = hostInput.value.trim().replace(/\/+$/, "");
	if (!host) return;
	browser.runtime.sendMessage({ type: "setHost", host }).then(() => {
		saveBtn.textContent = "Saved";
		saveBtn.classList.add("saved");
		setTimeout(() => {
			saveBtn.textContent = "Save";
			saveBtn.classList.remove("saved");
		}, 1500);
	});
});

hostInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") saveBtn.click();
});

function updateStatus(enabled) {
	status.textContent = enabled ? "Redirecting" : "Paused";
	status.className = "status" + (enabled ? " active" : "");
}
