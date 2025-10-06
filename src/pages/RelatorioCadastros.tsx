
// Adição do CDN do Tailwind CSS para garantir o visual da prévia.
// Note: No ambiente Canvas, o Tailwind é frequentemente injetado automaticamente, mas
// garantimos a presença aqui para ambientes que exigem o script explícito.
import React, { useRef, useState, useEffect } from "react";

// --- Configuração das bibliotecas via CDN ---
// Estas bibliotecas serão carregadas no runtime, mas o TypeScript/JSX exige que as definamos como variáveis globais
// para evitar erros de "não resolvida" no momento da compilação/bundling.
declare const XLSX: any;
declare const jsPDF: any;
declare const html2canvas: any;

// A biblioteca Recharts é carregada internamente.
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

// Adicionar os scripts de CDN necessários ao escopo global (assumindo que o ambiente React permite):
// No ambiente Canvas, é necessário garantir que estes scripts sejam carregados.
// Normalmente, isso seria feito no index.html, mas como é um arquivo único,
// usaremos uma abordagem de carregamento no início do componente.

const loadScript = (src: string, id: string, onLoad: () => void) => {
    if (!document.getElementById(id)) {
        const script = document.createElement('script');
        script.src = src;
        script.id = id;
        script.onload = onLoad;
        document.head.appendChild(script);
    } else {
        onLoad();
    }
};

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
  "nome": "nome",
  "cpf": "cpf",
  "estado": "estado",
  "cidade": "cidade",
  "responsavel da fidelizacao": "responsavelFidelizacao",
  "responsavel pela fidelizacao": "responsavelFidelizacao",
  "responsavel fidelizacao": "responsavelFidelizacao",
  "acoes informadas": "acoesInformadas",
  "situacao": "situacao",
  "pendencias": "pendencias",
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
  "responsavel": "responsavelCadastramento",
};

function mapHeaderToKey(normalized: string): keyof Cliente | undefined {
  // direct match
  if (headerMap[normalized]) return headerMap[normalized];

  // fallback: check if normalized contains a known substring
  for (const k of Object.keys(headerMap)) {
    // normaliza a chave do headerMap para garantir robustez
    const nk = normalizeHeader(k);
    if (normalized.includes(nk)) return headerMap[k];
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
  // ...existing code...

  // ...existing code...
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [previewRows, setPreviewRows] = useState<Cliente[]>([]);

  // Função para normalizar texto para busca robusta
  function normalizeText(s: string) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // --- Comparação Interno vs Externo (fidelização) ---
  // (deve ser calculado após clientes e normalizeText)
  const clientesNovos = clientes.filter((c) =>
    normalizeText(c.acoesInformadas || "").includes("novo")
    || normalizeText(c.situacao || "").includes("concluido")
  );
  let interno = 0;
  let externo = 0;
  clientesNovos.forEach((c) => {
    const resp = (c.responsavelFidelizacao || "").trim().toLowerCase();
    if (resp === "comercial 1") {
      interno++;
    } else if (resp) {
      externo++;
    }
  });
  const comparacaoFidelizacao = [
    { tipo: "Interno (Comercial 1)", total: interno },
    { tipo: "Externo (outros)", total: externo },
  ];

  // --- Comparação de fechamentos por estado (RN, MA, RJ, SP) ---
  // Considera apenas clientes novos/concluídos
  const estadosComparar = ["RN", "MA", "RJ", "SP"];
  const fechamentoPorEstado: Record<string, number> = { RN: 0, MA: 0, RJ: 0, SP: 0 };
  clientesNovos.forEach((c) => {
    const estado = (c.estado || "").trim().toUpperCase();
    if (estadosComparar.includes(estado)) {
      fechamentoPorEstado[estado] = (fechamentoPorEstado[estado] || 0) + 1;
    }
  });
  const comparacaoEstados = estadosComparar.map(uf => ({ estado: uf, total: fechamentoPorEstado[uf] }));
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);

  // Carregar as bibliotecas externas (XLSX, jsPDF, html2canvas) via CDN
  useEffect(() => {
    let loadedCount = 0;
    // Agora precisamos de 4 scripts (3 libs + Tailwind)
    const totalScripts = 4;
    const checkReady = () => {
        loadedCount++;
        if (loadedCount === totalScripts) {
            setIsLibraryReady(true);
        }
    };

    // 1. Carrega o Tailwind CSS
    loadScript("https://cdn.tailwindcss.com", "tailwind-cdn", checkReady);
    // 2. Carrega as bibliotecas de dados/exportação
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "xlsx-cdn", checkReady);
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "jspdf-cdn", checkReady);
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "html2canvas-cdn", checkReady);
  }, []);


  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLibraryReady) {
        console.error("As bibliotecas de processamento ainda não foram carregadas.");
        // Substituído 'alert' por console.log para seguir as diretrizes, mas o ideal seria um modal
        console.log("Aguarde um momento enquanto o processador de arquivos é carregado. Tente novamente.");
        return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      // XLSX é globalmente disponível aqui
      const workbook = XLSX.read(data, { type: "array" }); 
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // sheet_to_json with raw: false to ensure dates are converted by SheetJS if possible
      const raw: RawRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });

      if (raw.length > 0) {
        const headers = Object.keys(raw[0]);
        console.log("Cabeçalhos do Excel:", headers);
        console.log("Cabeçalhos normalizados:", headers.map(normalizeHeader));
      }

      const mapped: Cliente[] = raw.map((row, idx) => {
        const out: Cliente = { raw: row };
        Object.entries(row).forEach(([h, v]) => {
          const nh = normalizeHeader(h);
          const key = mapHeaderToKey(nh);
          if (!key) {
            // Linha com cabeçalho não mapeado (pode ser uma linha de metadados ou vazia)
            return;
          }
          switch (key) {
            case "dataProc":
            case "dataEnvioProc":
            case "dataLimiteCadastro":
            case "dataLimiteAnalise":
            case "dataLimitePeticao":
            case "dataLimiteProtocolo":
              // Se SheetJS não converteu para Date (v não é Date), tentamos o parse
              if (v && !(v instanceof Date)) {
                  (out as any)[key] = parseDate(v);
              } else {
                  (out as any)[key] = v; // Se já é Date ou null/undefined
              }
              break;
            case "pendencias":
              out.pendencias = splitPendencias(v);
              break;
            case "diasAtrasado":
              // Tenta extrair apenas números e converte. Se falhar, usa null
              const n = Number(String(v).replace(/[^0-9-.]/g, ""));
              (out as any)[key] = isNaN(n) ? null : Math.round(n);
              break;
            default:
              (out as any)[key] = String(v ?? "").trim();
          }
        });
        // if diasAtrasado not supplied, compute a simple atraso based on dataLimiteProtocolo
        if (out.diasAtrasado == null && out.dataLimiteProtocolo instanceof Date) {
          const today = new Date();
          // Garante que a comparação é só por data (meia-noite)
          const limitDate = new Date(out.dataLimiteProtocolo.getFullYear(), out.dataLimiteProtocolo.getMonth(), out.dataLimiteProtocolo.getDate());
          const diffTime = today.getTime() - limitDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          out.diasAtrasado = diffDays > 0 ? diffDays : 0;
        }
        return out;
      });

      // NOVO: Filtrar clientes que não possuem Nome ou CPF preenchidos (linhas incompletas/vazias)
      const validClientes = mapped.filter(c => {
          const hasName = String(c.nome || "").trim().length > 0;
          const hasCPF = String(c.cpf || "").trim().length > 0;
          // O registro é válido se tiver Nome OU CPF
          return hasName || hasCPF;
      });
      
      console.log("Total de linhas lidas (raw):", raw.length);
      console.log("Total de clientes válidos (filtrados):", validClientes.length);
      console.log("Primeiro(s) objeto(s) mapeado(s) e filtrado(s):", validClientes.slice(0, 2));

      setClientes(validClientes);
      setPreviewRows(validClientes.slice(0, 10));
    };
    reader.readAsArrayBuffer(file);
  };

  /* --------------- Metrics --------------- */
  const total = clientes.length;
  // Função para normalizar texto para busca robusta


  // Usando 'concluido' como status de cliente novo/cadastrado, conforme o seu dado de exemplo
  const totalNovos = clientes.filter((c) =>
    normalizeText(c.acoesInformadas || "").includes("novo")
    || normalizeText(c.situacao || "").includes("concluido") 
  ).length;
  
  // A lógica de 'atualização' permanece
  const totalAtualizacoes = clientes.filter((c) =>
    normalizeText(c.acoesInformadas || "").includes("atualiza")
    || normalizeText(c.situacao || "").includes("atualiza")
  ).length;

  // Contagem de pendências
  const pendenciasFlat = clientes.flatMap((c) => c.pendencias || []);
  const pendenciasCount = pendenciasFlat.reduce<Record<string, number>>((acc, p) => {
    const k = p || "Sem especificar";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const pendenciasArray = Object.entries(pendenciasCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Top cidades
  const cityCount = clientes.reduce<Record<string, number>>((acc, c) => {
    const k = (c.cidade || "Não informado").trim();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const topCities = Object.entries(cityCount)
    .map(([cidade, value]) => ({ cidade, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Por responsável (cadastramento)
  const respCount = clientes.reduce<Record<string, number>>((acc, c) => {
    const k = (c.responsavelCadastramento || c.responsavelFidelizacao || "Não informado").trim();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const respArray = Object.entries(respCount).map(([nome, total]) => ({ nome, total }));

  // Fechamentos por responsável (clientes novos)
  const fechamentoPorResponsavel: Record<string, number> = {};
  clientes.forEach((c) => {
    const isNovo = normalizeText(c.acoesInformadas || "").includes("novo") || normalizeText(c.situacao || "").includes("concluido");
    if (isNovo) {
      const resp = (c.responsavelCadastramento || c.responsavelFidelizacao || "Não informado").trim();
      fechamentoPorResponsavel[resp] = (fechamentoPorResponsavel[resp] || 0) + 1;
    }
  });
  const fechamentoArray = Object.entries(fechamentoPorResponsavel).map(([nome, total]) => ({ nome, total }));

  /* --------------- Export to PDF --------------- */
  const exportPDF = async () => {
    if (!reportRef.current || typeof jsPDF === 'undefined' || typeof html2canvas === 'undefined') {
        console.error("Bibliotecas de PDF ou HTML2Canvas não estão prontas.");
        return;
    }
    const element = reportRef.current;
    // scale for better resolution
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    
    // jsPDF é globalmente disponível aqui
    const { jsPDF: JsPDFClass } = jsPDF;
    const pdf = new JsPDFClass("p", "mm", "a4");
    
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
      position = - (imgHeight - (heightLeft + margin)); // Ajuste de posição para a próxima página
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }
    pdf.save("relatorio_cadastros.pdf");
  };

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A28BFF", "#FF6B8A"];

  return (
  <div className="p-0 bg-gray-50 min-h-screen font-sans w-full min-h-[100vh] overflow-x-hidden px-4 md:px-8">
      {/* Script do Tailwind CSS para garantir o estilo */}
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Scripts CDN para o ambiente de arquivo único */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

  <h1 className="text-3xl font-extrabold mb-6 text-gray-800 border-b pb-2 w-full">Relatório de Cadastros</h1>



  <div className="mb-8 p-4 bg-white shadow-lg rounded-xl w-full max-w-none">
        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
          Carregar Planilha (.xlsx, .xls)
        </label>
        <input 
          id="file-upload"
          type="file" 
          accept=".xlsx,.xls" 
          onChange={handleFile} 
          disabled={!isLibraryReady}
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
         {!isLibraryReady && (
            <div className="mt-2 text-sm text-yellow-600">A carregar módulos necessários (Tailwind, XLSX, PDF...). Aguarde um momento.</div>
        )}
      </div>

      {total === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl shadow-lg">
          <p className="text-xl text-gray-600">
            Faça upload do Excel com os dados para gerar as métricas e gráficos.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Aguardando arquivo...
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="text-sm font-medium text-gray-500">Total registros</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">{total}</div>
            </div>
            <div className="p-5 bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="text-sm font-medium text-blue-600">Clientes Novos (Concluídos)</div>
              <div className="text-3xl font-bold text-blue-700 mt-1">{totalNovos}</div>
            </div>
            <div className="p-5 bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="text-sm font-medium text-green-600">Atualizações</div>
              <div className="text-3xl font-bold text-green-700 mt-1">{totalAtualizacoes}</div>
            </div>
            <div className="p-5 bg-white shadow-lg rounded-xl border border-gray-100">
              <div className="text-sm font-medium text-gray-500">Fechamentos por responsável</div>
              <ul className="text-base font-semibold mt-2 space-y-1">
                {fechamentoArray.length === 0 && <li className="text-sm text-red-500">Nenhum</li>}
                {fechamentoArray.map((f) => (
                  <li key={f.nome} className="flex justify-between items-center text-gray-700">
                    <span className="truncate pr-2">{f.nome}:</span> <span className="text-lg font-extrabold">{f.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div ref={reportRef} className="bg-white p-6 rounded-xl shadow-lg space-y-8 print:shadow-none print:p-0 w-full max-w-none">
            {/* Comparação de fechamentos por estado */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Fechamentos por Estado (RN, MA, RJ, SP)</h2>
              <div className="w-full h-64 bg-gray-50 p-4 rounded-lg mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparacaoEstados} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="estado" stroke="#333" className="text-xs" />
                    <YAxis stroke="#333" className="text-xs" allowDecimals={false} />
                    <Tooltip formatter={(value, name, props) => [value, `Estado: ${(props && props.payload && props.payload.estado) || ''}`]} labelFormatter={label => `Estado: ${label}`} />
                    <Bar dataKey="total" fill="#f59e42" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            {/* Comparação Interno vs Externo */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Comparação: Interno X Externo</h2>
              <div className="w-full h-64 bg-gray-50 p-4 rounded-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparacaoFidelizacao} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="tipo" stroke="#333" className="text-xs" />
                    <YAxis stroke="#333" className="text-xs" allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name, props) => {
                        // value = número de cadastros, name = 'value', props.payload.name = cidade
                        return [value, `Cidade: ${(props && props.payload && props.payload.name) || ''}`];
                      }}
                      labelFormatter={(label) => `Cidade: ${label}`}
                    />
                    <Bar dataKey="total" fill="#f59e42" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Top Cities */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Top cidades (maiores cadastros)</h2>
              <div className="w-full h-80 bg-gray-50 p-4 rounded-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCities.map(t => ({ name: t.cidade, value: t.value }))} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#333" className="text-xs" />
                    <YAxis stroke="#333" className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Pendencias Pie */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Top 6 Pendências por tipo</h2>
              <div className="w-full h-80 flex flex-row justify-center items-center bg-gray-50 p-4 rounded-lg gap-8">
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pendenciasArray.slice(0, 6)}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={100}
                        label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        innerRadius={50}
                      >
                        {pendenciasArray.slice(0, 6).map((entry, idx) => (
                          <Cell key={entry.name} fill={COLORS[idx]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name, props) => [`${value} (${((props as any).payload.percent * 100).toFixed(1)}%)`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center h-full min-w-[180px]">
                  {pendenciasArray.slice(0, 6).map((entry, idx) => (
                    <div key={entry.name} className="flex items-center mb-3 last:mb-0">
                      <span className="inline-block w-5 h-5 rounded mr-2 border" style={{ backgroundColor: COLORS[idx] }}></span>
                      <span className="font-medium text-gray-700">{entry.name}</span>
                      <span className="ml-auto text-gray-500 font-semibold">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* By responsible */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Registros por responsável</h2>
              <div className="w-full h-80 bg-gray-50 p-4 rounded-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={respArray} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="nome" stroke="#333" className="text-xs" />
                    <YAxis stroke="#333" className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="total" fill="#059669" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Tabela preview */}
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Preview (primeiras linhas)</h2>
              <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg shadow-inner">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cidade</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Situação</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pendências</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {previewRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.nome || "-"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.cidade || "-"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.situacao || "-"}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{(r.pendencias || []).join(", ") || "-"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.responsavelCadastramento || r.responsavelFidelizacao || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setPreviewRows(clientes.slice(0, Math.min(clientes.length, previewRows.length + 50)))}
              className="px-6 py-3 border border-gray-300 bg-white text-gray-700 rounded-xl shadow-md hover:bg-gray-100 transition duration-150 ease-in-out font-semibold"
            >
              Mostrar mais linhas ({Math.min(clientes.length, previewRows.length + 50)} de {clientes.length})
            </button>
            <button 
              onClick={exportPDF} 
              disabled={!isLibraryReady}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition duration-150 ease-in-out font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              Exportar PDF 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}