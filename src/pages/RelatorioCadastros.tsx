// src/pages/RelatorioCadastros.tsx
import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* -------------------- Types -------------------- */
type RawRow = Record<string, any>;

interface Cliente {
  nome?: string;
  cpf?: string;
  estado?: string;
  cidade?: string;
  responsavelFidelizacao?: string;
  acoesInformadas?: string;
  situacao?: string;
  pendencias?: string[]; // splitted array
  dataProc?: Date | null;
  dataEnvioProc?: Date | null;
  dataLimiteCadastro?: Date | null;
  dataLimiteAnalise?: Date | null;
  dataLimitePeticao?: Date | null;
  dataLimiteProtocolo?: Date | null;
  prazo20dias?: string;
  diasAtrasado?: number | null;
  responsavelCadastramento?: string;
  raw?: RawRow;
}

/* -------------------- Helpers -------------------- */
function normalizeHeader(h: string) {
  if (!h) return "";
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

const headerMap: Record<string, keyof Cliente> = {
  "cliente novo": "nome",
  nome: "nome",
  cpf: "cpf",
  estado: "estado",
  cidade: "cidade",
  "responsavel da fidelizacao": "responsavelFidelizacao",
  "responsavel pela fidelizacao": "responsavelFidelizacao",
  "responsavel fidelizacao": "responsavelFidelizacao",
  "acoes informadas": "acoesInformadas",
  situacao: "situacao",
  pendencias: "pendencias",
  "data da procuracao": "dataProc",
  "data do envio da procuracao": "dataEnvioProc",
  "data limite para cadastro": "dataLimiteCadastro",
  "data limite para analise": "dataLimiteAnalise",
  "data limite para peticao inicial": "dataLimitePeticao",
  "data limite para protocolo": "dataLimiteProtocolo",
  "prazo de 20 dias": "prazo20dias",
  "quantos dias esta atrasado": "diasAtrasado",
  "quantos dias está atrasado": "diasAtrasado",
  "responsavel pelo cadastramento": "responsavelCadastramento",
  "responsavel pelo cadastro": "responsavelCadastramento",
  responsavel: "responsavelCadastramento",
};

function mapHeaderToKey(normalized: string): keyof Cliente | undefined {
  // direct match
  if (headerMap[normalized]) return headerMap[normalized];

  // fallback: check if normalized contains a known substring
  for (const k of Object.keys(headerMap)) {
    if (normalized.includes(k)) return headerMap[k];
  }
  return undefined;
}

function parseDate(value: any): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;

  // Excel sometimes exports dates as numbers (days since 1900) -> SheetJS may convert to Date already.
  // Attempt dd/mm/yyyy
  const parts = s.split("/");
  if (parts.length === 3) {
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[2]);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y > 1900) {
      return new Date(y, m, d);
    }
    return null;
  }

  // ISO-ish
  const iso = Date.parse(s);
  if (!isNaN(iso)) {
    const dt = new Date(iso);
    if (dt.getFullYear() > 1900) return dt;
  }
  // if it's a number (Excel serial) try convert (common Excel origin)
  const n = Number(s);
  if (!isNaN(n) && n > 0) {
    // Excel serial to JS Date: (n - 25569) * 86400 * 1000
    const dt = new Date(Math.round((n - 25569) * 86400 * 1000));
    if (dt.getFullYear() > 1900) return dt;
  }

  return null;
}

function splitPendencias(raw: any): string[] {
  if (!raw) return [];
  const s = String(raw).replace(/\r/g, " ").replace(/\n/g, " ");
  return s
    .split(/[,;|\/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* -------------------- Component -------------------- */
export default function RelatorioCadastros() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [previewRows, setPreviewRows] = useState<Cliente[]>([]);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const raw: RawRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      const mapped: Cliente[] = raw.map((row) => {
        const out: Cliente = { raw: row };
        Object.entries(row).forEach(([h, v]) => {
          const nh = normalizeHeader(h);
          const key = mapHeaderToKey(nh);
          if (!key) return;
          switch (key) {
            case "dataProc":
            case "dataEnvioProc":
            case "dataLimiteCadastro":
            case "dataLimiteAnalise":
            case "dataLimitePeticao":
            case "dataLimiteProtocolo":
              (out as any)[key] = parseDate(v);
              break;
            case "pendencias":
              out.pendencias = splitPendencias(v);
              break;
            case "diasAtrasado":
              const n = Number(String(v).replace(/\D+/g, ""));
              (out as any)[key] = isNaN(n) ? null : n;
              break;
            default:
              (out as any)[key] = String(v ?? "").trim();
          }
        });
        // if diasAtrasado not supplied, compute a simple atraso based on dataLimiteProtocolo
        if (out.diasAtrasado == null && out.dataLimiteProtocolo instanceof Date) {
          const diff = Math.floor((Date.now() - out.dataLimiteProtocolo.getTime()) / (1000 * 60 * 60 * 24));
          out.diasAtrasado = diff > 0 ? diff : 0;
        }
        return out;
      });

      setClientes(mapped);
      setPreviewRows(mapped.slice(0, 10));
    };
    reader.readAsArrayBuffer(file);
  };

  /* --------------- Metrics --------------- */
  const total = clientes.length;
  const totalNovos = clientes.filter((c) =>
    (c.acoesInformadas || "").toLowerCase().includes("novo")
    || (c.situacao || "").toLowerCase().includes("cadastrado")
  ).length;
  const totalAtualizacoes = clientes.filter((c) =>
    (c.acoesInformadas || "").toLowerCase().includes("atualiza")
    || (c.situacao || "").toLowerCase().includes("atualiza")
  ).length;

  // pendencias count
  const pendenciasFlat = clientes.flatMap((c) => c.pendencias || []);
  const pendenciasCount = pendenciasFlat.reduce<Record<string, number>>((acc, p) => {
    const k = p || "Sem especificar";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const pendenciasArray = Object.entries(pendenciasCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // top cities
  const cityCount = clientes.reduce<Record<string, number>>((acc, c) => {
    const k = (c.cidade || "Não informado").trim();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const topCities = Object.entries(cityCount)
    .map(([cidade, value]) => ({ cidade, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // by responsible (cadastramento)
  const respCount = clientes.reduce<Record<string, number>>((acc, c) => {
    const k = (c.responsavelCadastramento || c.responsavelFidelizacao || "Não informado").trim();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const respArray = Object.entries(respCount).map(([nome, total]) => ({ nome, total }));

  /* --------------- Export to PDF --------------- */
  const exportPDF = async () => {
    if (!reportRef.current) return;
    const element = reportRef.current;
    // scale for better resolution
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      pdf.addPage();
      position = heightLeft > imgHeight ? margin - (imgHeight - (heightLeft + margin)) : margin - (imgHeight - (heightLeft + margin));
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }
    pdf.save("relatorio_cadastros.pdf");
  };

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A28BFF", "#FF6B8A"];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Relatório de Cadastros (cliente-side)</h1>

      <div className="mb-4">
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
      </div>

      {total === 0 ? (
        <div className="text-sm text-muted">Faça upload do Excel com os dados brutos para gerar o relatório.</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="p-4 border rounded">
              <div className="text-sm text-gray-500">Total registros</div>
              <div className="text-2xl font-bold">{total}</div>
            </div>
            <div className="p-4 border rounded">
              <div className="text-sm text-gray-500">Clientes Novos</div>
              <div className="text-2xl font-bold">{totalNovos}</div>
            </div>
            <div className="p-4 border rounded">
              <div className="text-sm text-gray-500">Atualizações</div>
              <div className="text-2xl font-bold">{totalAtualizacoes}</div>
            </div>
          </div>

          <div ref={reportRef} style={{ background: "#fff", padding: 12 }}>
            {/* Top Cities */}
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Top cidades (maiores cadastros)</h2>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={topCities.map(t => ({ name: t.cidade, value: t.value }))}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Pendencias Pie */}
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Pendências por tipo</h2>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pendenciasArray.slice(0, 6)}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                    >
                      {pendenciasArray.slice(0, 6).map((entry, idx) => (
                        <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* By responsible */}
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Registros por responsável</h2>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={respArray}>
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" fill="#00C49F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Tabela preview */}
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Preview (primeiras linhas)</h2>
              <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Nome</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Cidade</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Situação</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Pendências</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{r.nome || "-"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{r.cidade || "-"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{r.situacao || "-"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{(r.pendencias || []).join(", ") || "-"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{r.responsavelCadastramento || r.responsavelFidelizacao || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setPreviewRows(clientes.slice(0, 50))}
              className="px-4 py-2 border rounded"
            >
              Mostrar mais (50)
            </button>
            <button onClick={exportPDF} className="px-4 py-2 bg-blue-600 text-white rounded">
              Exportar PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
