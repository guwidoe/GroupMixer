import { Html } from "@react-three/drei";

export function ModelLoadError() {
  return (
    <Html center>
      <div
        style={{
          background: "linear-gradient(135deg, #ff6b6b, #ee5a24)",
          color: "white",
          padding: "20px 30px",
          borderRadius: "12px",
          textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          maxWidth: "300px",
        }}
      >
        <div style={{ fontSize: "24px", marginBottom: "10px" }}>⚠️</div>
        <div style={{ fontWeight: "bold", fontSize: "16px" }}>
          Character Model Not Found
        </div>
        <div style={{ fontSize: "12px", marginTop: "10px", opacity: 0.9 }}>
          Download a Mixamo character and save it to:
          <br />
          <code
            style={{
              background: "rgba(0,0,0,0.3)",
              padding: "4px 8px",
              borderRadius: "4px",
              display: "inline-block",
              marginTop: "5px",
            }}
          >
            public/models/character.glb
          </code>
        </div>
      </div>
    </Html>
  );
}
