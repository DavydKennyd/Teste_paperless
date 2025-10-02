import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import RelatorioCadastros from "./pages/RelatorioCadastros";

function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: 10, background: "#eee" }}>
        <Link to="/">Home</Link> |{" "}
        <Link to="/relatorios">Relatórios</Link>
      </nav>
      <Routes>
        <Route path="/" element={<h1>Bem-vindo ao sistema</h1>} />
        <Route path="/relatorios" element={<RelatorioCadastros />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
