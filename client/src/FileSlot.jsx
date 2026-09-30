import { useState } from "react";

export default function FileSlot({ label, accept = "image/*,.pdf", onFile, captured }) {
  const [name, setName] = useState("");

  function onChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setName(file.name);
      onFile({ fileData: String(reader.result), fileName: file.name });
    };
    reader.readAsDataURL(file);
  }

  return (
    <label className="file-slot">
      <span>{label}</span>
      <input type="file" accept={accept} onChange={onChange} />
      <em>{captured || name ? `Uploaded${name ? `: ${name}` : ""}` : "Choose file / scan"}</em>
    </label>
  );
}
