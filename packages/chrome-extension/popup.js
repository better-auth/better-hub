const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const hostInput = document.getElementById("host");
const saveBtn = document.getElementById("save");

// Load saved state
chrome.storage.local.get(["enabled", "host"], (data) => {
	const enabled = data.enabled !== false;
	toggle.checked = enabled;
	hostInput.value = data.host || "https://better-hub.com";
	updateStatus(enabled);
});

// Toggle redirect on/off
toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	chrome.runtime.sendMessage({ type: "toggle", enabled }, () => {
		updateStatus(enabled);
	});
});

// Save host
saveBtn.addEventListener("click", () => {
	const host = hostInput.value.trim().replace(/\/+$/, "");
	if (!host) return;
	chrome.runtime.sendMessage({ type: "setHost", host }, () => {
		saveBtn.textContent = "Saved";
		saveBtn.classList.add("saved");
		setTimeout(() => {
			saveBtn.textContent = "Save";
			saveBtn.classList.remove("saved");
		}, 1500);
	});
});

// Enter key saves
hostInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") saveBtn.click();
});

function updateStatus(enabled) {
	status.textContent = enabled ? "Redirecting" : "Paused";
	status.className = "status" + (enabled ? " active" : "");
}
