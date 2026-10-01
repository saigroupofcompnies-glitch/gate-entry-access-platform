import { useEffect, useRef, useState } from "react";

export default function CameraCapture({ onCapture, label = "Capture face", autoSnap = false, kiosk = false }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState("");
  const snapped = useRef(false);

  useEffect(() => {
    let stream;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setErr("Camera unavailable. You can still proceed with a file photo."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const data = canvas.toDataURL("image/jpeg", 0.82);
    setPreview(data);
    onCapture(data);
  }

  useEffect(() => {
    if (!autoSnap || snapped.current) return undefined;
    const t = setTimeout(() => {
      if (snapped.current) return;
      snapped.current = true;
      snap();
    }, 1600);
    return () => clearTimeout(t);
  }, [autoSnap]);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      onCapture(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="camera-box">
      <div className="camera-frame">
        {preview ? <img src={preview} alt="Captured" /> : <video ref={videoRef} autoPlay playsInline muted />}
      </div>
      {err && <p className="warn">{err}</p>}
      {!kiosk && (
        <div className="row">
          <button type="button" className="btn" onClick={snap}>{label}</button>
          {preview && (
            <button type="button" className="btn ghost" onClick={() => { setPreview(""); snapped.current = false; onCapture(""); }}>
              Retake
            </button>
          )}
          <label className="btn ghost file-lab">
            Upload photo
            <input type="file" accept="image/*" hidden onChange={onFile} />
          </label>
        </div>
      )}
    </div>
  );
}
