import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const EYE_CLOSED_THRESHOLD = 0.21;
const YAWN_THRESHOLD = 0.58;
const EYE_CLOSED_DURATION_MS = 1600;
const YAWN_DURATION_MS = 2000;
const ALERT_COOLDOWN_MS = 10000;

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const context = canvas.getContext("2d");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const dismissButton = document.querySelector("#dismissButton");
const monitorState = document.querySelector("#monitorState");
const monitorStateText = document.querySelector("#monitorStateText");
const cameraPlaceholder = document.querySelector("#cameraPlaceholder");
const faceBadge = document.querySelector("#faceBadge");
const eyeStatus = document.querySelector("#eyeStatus");
const eyeDetail = document.querySelector("#eyeDetail");
const yawnStatus = document.querySelector("#yawnStatus");
const yawnDetail = document.querySelector("#yawnDetail");
const alertCard = document.querySelector("#alertCard");
const alertTitle = document.querySelector("#alertTitle");
const alertMessage = document.querySelector("#alertMessage");
const alarmStatus = document.querySelector("#alarmStatus");
const locationDot = document.querySelector("#locationDot");
const locationText = document.querySelector("#locationText");
const locationCoords = document.querySelector("#locationCoords");
const contactPhone = document.querySelector("#contactPhone");
const smsButton = document.querySelector("#smsButton");
const whatsappButton = document.querySelector("#whatsappButton");

let landmarker;
let cameraStream;
let animationFrame;
let locationWatch;
let latestLocation;
let audioContext;
let alarmTimer;
let eyeClosedSince;
let yawnSince;
let lastAlertAt = 0;
let monitoring = false;
let alarmActive = false;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(points, upperA, upperB, lowerA, lowerB, left, right) {
  return (distance(points[upperA], points[lowerA]) + distance(points[upperB], points[lowerB])) /
    (2 * distance(points[left], points[right]));
}

function mouthAspectRatio(points) {
  return distance(points[13], points[14]) / distance(points[78], points[308]);
}

function resizeOverlay() {
  const bounds = video.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function drawFace(points) {
  resizeOverlay();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const outline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  context.clearRect(0, 0, width, height);
  context.beginPath();
  outline.forEach((index, position) => {
    const point = points[index];
    const x = point.x * width;
    const y = point.y * height;
    if (position === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.strokeStyle = "rgba(83, 227, 177, .8)";
  context.lineWidth = 1.5;
  context.stroke();
}

function setMonitorState(state, label) {
  monitorState.className = `state-pill state-${state}`;
  monitorStateText.textContent = label;
}

function setFaceDetected(detected) {
  faceBadge.classList.toggle("face-detected", detected);
  faceBadge.lastChild.textContent = detected ? "Face detected" : "Face not detected";
}

function startAlarm(reason) {
  const now = Date.now();
  if (alarmActive || now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  alarmActive = true;
  alertCard.classList.add("alert-active", "alarm-on");
  alertTitle.textContent = "Drowsiness detected";
  alertMessage.textContent = `${reason} Take a break as soon as it is safe. Share your location with your trusted contact if you need help.`;
  alarmStatus.textContent = "Alarm sounding";
  dismissButton.hidden = false;
  setMonitorState("warning", "Take a break");
  playAlarm();
}

function playAlarm() {
  if (!audioContext) return;
  const beep = () => {
    if (!alarmActive) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.34);
  };
  beep();
  alarmTimer = window.setInterval(beep, 800);
}

function stopAlarm() {
  alarmActive = false;
  window.clearInterval(alarmTimer);
  alertCard.classList.remove("alarm-on");
  alarmStatus.textContent = "Alarm is off";
  dismissButton.hidden = true;
  if (monitoring) {
    alertCard.classList.remove("alert-active");
    alertTitle.textContent = "You're all set";
    alertMessage.textContent = "Monitoring continues. Pull over somewhere safe if you feel tired.";
    setMonitorState("live", "Monitoring");
  }
}

function updateMeasurements(points) {
  const leftEye = eyeAspectRatio(points, 160, 158, 144, 153, 33, 133);
  const rightEye = eyeAspectRatio(points, 385, 387, 380, 373, 362, 263);
  const eyeRatio = (leftEye + rightEye) / 2;
  const mouthRatio = mouthAspectRatio(points);
  const now = Date.now();
  const eyesClosed = eyeRatio < EYE_CLOSED_THRESHOLD;
  const yawning = mouthRatio > YAWN_THRESHOLD;

  eyeStatus.textContent = eyesClosed ? "Closed" : "Open";
  eyeDetail.textContent = `Eye ratio ${eyeRatio.toFixed(2)} · threshold ${EYE_CLOSED_THRESHOLD}`;
  yawnStatus.textContent = yawning ? "Possible yawn" : "Normal";
  yawnDetail.textContent = `Mouth ratio ${mouthRatio.toFixed(2)} · threshold ${YAWN_THRESHOLD}`;
  document.querySelector(".metrics .metric").classList.toggle("is-warning", eyesClosed);
  document.querySelectorAll(".metrics .metric")[1].classList.toggle("is-warning", yawning);

  eyeClosedSince = eyesClosed ? (eyeClosedSince || now) : undefined;
  yawnSince = yawning ? (yawnSince || now) : undefined;
  if (eyeClosedSince && now - eyeClosedSince >= EYE_CLOSED_DURATION_MS) {
    startAlarm("Prolonged eye closure detected.");
  } else if (yawnSince && now - yawnSince >= YAWN_DURATION_MS) {
    startAlarm("Prolonged mouth opening detected.");
  }
}

function detectionLoop() {
  if (!monitoring) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && landmarker) {
    const result = landmarker.detectForVideo(video, performance.now());
    const points = result.faceLandmarks?.[0];
    if (points) {
      setFaceDetected(true);
      drawFace(points);
      updateMeasurements(points);
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
      setFaceDetected(false);
      eyeStatus.textContent = "—";
      eyeDetail.textContent = "No face in frame";
      yawnStatus.textContent = "—";
      yawnDetail.textContent = "No face in frame";
      eyeClosedSince = undefined;
      yawnSince = undefined;
    }
  }
  animationFrame = requestAnimationFrame(detectionLoop);
}

function updateLocationStatus(status, message) {
  locationDot.className = `location-dot ${status}`;
  locationText.textContent = message;
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    updateLocationStatus("location-error", "Location is not supported by this browser");
    return;
  }
  updateLocationStatus("locating", "Waiting for location permission…");
  locationWatch = navigator.geolocation.watchPosition(
    (position) => {
      latestLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        updatedAt: new Date(position.timestamp)
      };
      locationCoords.textContent = `Updated ${latestLocation.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      updateLocationStatus("located", "Location ready to share");
      smsButton.disabled = false;
      whatsappButton.disabled = false;
    },
    (error) => {
      const messages = {
        [error.PERMISSION_DENIED]: "Location permission denied",
        [error.POSITION_UNAVAILABLE]: "Location unavailable",
        [error.TIMEOUT]: "Location request timed out"
      };
      updateLocationStatus("location-error", messages[error.code] || "Unable to get location");
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

function getAlertMessage() {
  const mapUrl = `https://maps.google.com/?q=${latestLocation.latitude},${latestLocation.longitude}`;
  const time = latestLocation.updatedAt.toLocaleString();
  return `RoadReady alert: I may be drowsy and need you to check in. My latest location (${time}): ${mapUrl}`;
}

function getPhoneNumber() {
  const phone = contactPhone.value.trim();
  if (!phone) {
    contactPhone.focus();
    alert("Enter your trusted contact's phone number first.");
    return "";
  }
  return phone;
}

function shareLocation(method) {
  if (!latestLocation) return;
  const phone = getPhoneNumber();
  if (!phone) return;
  const message = encodeURIComponent(getAlertMessage());
  if (method === "sms") {
    window.location.href = `sms:${encodeURIComponent(phone)}?body=${message}`;
  } else {
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      contactPhone.focus();
      alert("Enter a valid phone number with its country code.");
      return;
    }
    window.open(`https://wa.me/${digits}?text=${message}`, "_blank", "noopener,noreferrer");
  }
}

async function startMonitoring() {
  startButton.disabled = true;
  startButton.textContent = "Starting…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is unavailable. Open this app on localhost or a secure HTTPS page.");
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = cameraStream;
    await video.play();
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    monitoring = true;
    cameraPlaceholder.hidden = true;
    startButton.hidden = true;
    stopButton.disabled = false;
    setMonitorState("live", "Monitoring");
    eyeDetail.textContent = "Watching for prolonged closure";
    yawnDetail.textContent = "Watching for prolonged yawns";
    startLocationTracking();
    detectionLoop();
  } catch (error) {
    stopMonitoring();
    alertTitle.textContent = "Unable to start";
    alertMessage.textContent = error.message || "Camera or face-detection setup failed. Check your permissions and connection, then try again.";
    alertCard.classList.add("alert-active");
  } finally {
    if (!monitoring) {
      startButton.hidden = false;
      startButton.disabled = false;
      startButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.75a1 1 0 0 1 1.5-.87l7.1 4.1a1.16 1.16 0 0 1 0 2.02l-7.1 4.1a1 1 0 0 1-1.5-.87V4.75Z"></path></svg>Start monitoring';
    }
  }
}

function stopMonitoring() {
  monitoring = false;
  cancelAnimationFrame(animationFrame);
  if (locationWatch !== undefined) navigator.geolocation?.clearWatch(locationWatch);
  locationWatch = undefined;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  video.srcObject = null;
  landmarker?.close();
  landmarker = undefined;
  audioContext?.close();
  audioContext = undefined;
  window.clearInterval(alarmTimer);
  alarmActive = false;
  eyeClosedSince = undefined;
  yawnSince = undefined;
  cameraPlaceholder.hidden = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  setFaceDetected(false);
  setMonitorState("idle", "Not monitoring");
  startButton.hidden = false;
  startButton.disabled = false;
  startButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.75a1 1 0 0 1 1.5-.87l7.1 4.1a1.16 1.16 0 0 1 0 2.02l-7.1 4.1a1 1 0 0 1-1.5-.87V4.75Z"></path></svg>Start monitoring';
  stopButton.disabled = true;
  dismissButton.hidden = true;
  alertCard.classList.remove("alert-active", "alarm-on");
  alertTitle.textContent = "You're all set";
  alertMessage.textContent = "Start monitoring to receive an audible warning if signs of drowsiness are detected.";
  alarmStatus.textContent = "Alarm is off";
  eyeStatus.textContent = "—";
  eyeDetail.textContent = "Waiting for camera";
  yawnStatus.textContent = "—";
  yawnDetail.textContent = "Waiting for camera";
  document.querySelectorAll(".metrics .metric").forEach((metric) => metric.classList.remove("is-warning"));
  updateLocationStatus("",
    "Location not being tracked");
  locationCoords.textContent = "";
  latestLocation = undefined;
  smsButton.disabled = true;
  whatsappButton.disabled = true;
}

startButton.addEventListener("click", startMonitoring);
stopButton.addEventListener("click", stopMonitoring);
dismissButton.addEventListener("click", stopAlarm);
smsButton.addEventListener("click", () => shareLocation("sms"));
whatsappButton.addEventListener("click", () => shareLocation("whatsapp"));
window.addEventListener("resize", () => { if (monitoring) resizeOverlay(); });
