import { useEffect, useState } from "react";
import "./App.css";

type ApiStatus = "checking" | "online" | "offline";

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    async function checkApi() {
      try {
        const response = await fetch("/api/v1/health");

        if (!response.ok) {
          throw new Error("API request failed.");
        }

        setApiStatus("online");
      } catch {
        setApiStatus("offline");
      }
    }

    void checkApi();
  }, []);

  return (
    <main>
      <h1>ChargeWise</h1>
      <p>Route-based EV charger discovery and personal charging analytics.</p>
      <p>
        API status: <strong>{apiStatus}</strong>
      </p>
    </main>
  );
}

export default App;
