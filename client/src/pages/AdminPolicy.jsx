import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminPolicy() {
  const [pass, setPass] = useState("70");
  const [border, setBorder] = useState("50");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/api/config").then((rows) => {
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      if (map["face.passThreshold"]) setPass(map["face.passThreshold"]);
      if (map["face.borderlineThreshold"]) setBorder(map["face.borderlineThreshold"]);
    });
  }, []);
  async function save(e) {
    e.preventDefault();
    await api("/api/config", { method: "PUT", body: { "face.passThreshold": pass, "face.borderlineThreshold": border } });
    setMsg("Policy saved. Gate and classroom devices pick this up on the next decision.");
  }
  return (
    <div>
      <div className="kicker">System Configuration</div>
      <h2>System Configuration</h2>
      <p className="hint">Face thresholds used at gate and classroom. Allocation rules are per exam on Allocation Engine.</p>
      <div className="panel">
        <form onSubmit={save}>
          <label>Face pass threshold</label>
          <input value={pass} onChange={(e) => setPass(e.target.value)} />
          <label>Face borderline threshold</label>
          <input value={border} onChange={(e) => setBorder(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Save policy</button>
        </form>
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  );
}
