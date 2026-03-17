// dashboard.js - Motor Analítico Dinâmico para DFC

// Regras de negócio base
const regrasSubtracaoHeader = ['rec_desp', 'fin_saida', 'emp_saida'];

// Instâncias ativas do Chart.js
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
});

async function updateDashboard() {
    const ano1 = document.getElementById('ano1').value;
    const ano2 = document.getElementById('ano2').value;
    
    // Captura o mês que o utilizador selecionou (pode ser "todos" ou 1 a 12)
    const selectMes = document.getElementById('mes_filtro');
    const mesFiltro = selectMes ? selectMes.value : 'todos';
    
    document.getElementById('explorerTree').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Processando Árvore DFC...</div>';

    const params = new URLSearchParams();
    params.append('ano1', ano1);
    if(ano2) params.append('ano2', ano2);
    
    const res = await fetch(`/api/dashboard/data?${params.toString()}`);
    const data = await res.json();
    
    if (data.status !== 'ok') {
        toast('Erro ao carregar dados do dashboard.', 'error');
        return;
    }

    // O processDataTree agora sabe se deve focar-se num mês em específico
    const procAno1 = processDataTree(data.layout, data.data_ano1, mesFiltro);
    const procAno2 = ano2 ? processDataTree(data.layout, data.data_ano2, mesFiltro) : null;

    renderKPIs(procAno1, data.data_ano1, mesFiltro);
    renderWaterfall(procAno1);
    renderInOutBars(procAno1, mesFiltro); // Gráfico Lado a Lado (com fading de meses não focados)
    renderYoY(procAno1, procAno2, ano1, ano2, mesFiltro);
    renderPareto(procAno1);
    renderExplorerTree(procAno1);
}

// ==========================================
// 1. MOTOR DE PROCESSAMENTO (DATA ENGINE)
// ==========================================
function processDataTree(layout, lancamentos, mesFiltro) {
    let tree = {
        masters: {}, 
        contasMap: {} 
    };

    let activeMaster = null;
    let activeHeader = null;

    layout.forEach(item => {
        if (item.tipo_linha === 'master') {
            activeMaster = item.grupo_calculo;
            tree.masters[activeMaster] = {
                id: item.id,
                texto: item.texto,
                total: 0,
                meses: new Array(13).fill(0),
                headers: {}
            };
        } 
        else if (item.tipo_linha === 'header' && activeMaster) {
            activeHeader = item.grupo_calculo;
            tree.masters[activeMaster].headers[activeHeader] = {
                id: item.id,
                texto: item.texto,
                total: 0,
                meses: new Array(13).fill(0),
                contas: []
            };
        } 
        else if (item.tipo_linha === 'conta' && activeHeader && activeMaster) {
            let contaObj = {
                id: item.id,
                cat_id: item.categoria_id,
                codigo: item.cat_codigo,
                nome: item.cat_nome,
                total: 0,
                meses: new Array(13).fill(0)
            };
            tree.masters[activeMaster].headers[activeHeader].contas.push(contaObj);
            tree.contasMap[item.categoria_id] = { conta: contaObj, header: activeHeader, master: activeMaster };
        }
    });

    let isTodos = (mesFiltro === 'todos' || !mesFiltro);
    let mesF = parseInt(mesFiltro);

    lancamentos.forEach(lanc => {
        let ref = tree.contasMap[lanc.cat_id];
        if (!ref) return;

        let val = lanc.valor;
        let m = lanc.mes;

        let hObj = tree.masters[ref.master].headers[ref.header];
        let mObj = tree.masters[ref.master];
        
        let isSub = false;
        if (ref.master === 'grp_emprestimos' && ref.header !== 'emp_entrada') isSub = true;
        else if (ref.master === 'grp_financeiro' && ref.header !== 'fin_entrada') isSub = true;
        else if (ref.master === 'grp_custos_var' && ref.header === 'rec_desp') isSub = true;
        else if (regrasSubtracaoHeader.includes(ref.header)) isSub = true;

        // PASSO 1: Alimentar sempre o array Mensal (Para não quebrar a tendência visual dos Gráficos de Barra)
        ref.conta.meses[m] += val;
        hObj.meses[m] += val;

        if (ref.master === 'grp_recebimentos') {
            if (ref.header === 'deducoes' || hObj.texto.toLowerCase().includes('deduç')) {
                mObj.meses[m] -= val;
            } else {
                mObj.meses[m] += val;
            }
        } else if (isSub) {
            mObj.meses[m] -= val;
        } else {
            mObj.meses[m] += val;
        }

        // PASSO 2: Alimentar os TOTAIS EXATOS apenas para o Mês selecionado no Filtro (Para KPIs, Pareto, Explorador, etc)
        if (isTodos || m === mesF) {
            ref.conta.total += val;
            hObj.total += val;

            if (ref.master === 'grp_recebimentos') {
                if (ref.header === 'deducoes' || hObj.texto.toLowerCase().includes('deduç')) {
                    mObj.total -= val;
                } else {
                    mObj.total += val;
                }
            } else if (isSub) {
                mObj.total -= val;
            } else {
                mObj.total += val;
            }
        }
    });

    tree.getM = (masterSlug) => tree.masters[masterSlug] ? tree.masters[masterSlug].total : 0;
    return tree;
}

// ==========================================
// 2. KPIS GERAIS E AUDITORIA HOVER INSTANTÂNEA
// ==========================================
function renderKPIs(tree, lancamentos, mesFiltro) {
    let mesesAtivos = 1;
    
    // Se estiver a ver o Ano todo, calcula a divisão correta dos meses para o Burn Rate
    if (mesFiltro === 'todos' || !mesFiltro) {
        mesesAtivos = new Set(lancamentos.map(l => l.mes)).size;
        if (mesesAtivos === 0) mesesAtivos = 1; 
    }

    let recLiq = tree.getM('grp_recebimentos'); 

    let custosVarNet = tree.getM('grp_custos_var');
    let despVar = tree.masters['grp_custos_var']?.headers['desp_var']?.total || 0;
    let custos = tree.masters['grp_custos_var']?.headers['custos']?.total || 0;
    let recDesp = tree.masters['grp_custos_var']?.headers['rec_desp']?.total || 0;
    
    let customCustosVar = custosVarNet - (despVar + custos - recDesp);
    let totalDespVar = despVar + customCustosVar;

    let rol = recLiq - totalDespVar + recDesp;
    let mcb = rol - custos;
    
    let desp = tree.getM('grp_desp_op');
    let fin = tree.getM('grp_financeiro'); 
    let imp = tree.getM('grp_impostos');
    let soc = tree.getM('grp_socios');
    let capex = tree.getM('grp_capex');
    
    let geracaoLiquida = mcb - desp + fin - imp - soc - capex;

    let emp = tree.getM('grp_emprestimos');
    let saldoFinal = geracaoLiquida + emp;

    let totalBurn = totalDespVar + custos + desp; 
    let burnRate = totalBurn / mesesAtivos;

    let runway = burnRate > 0 ? (saldoFinal / burnRate).toFixed(1) : "N/A";

    let elSaldo = document.getElementById('kpiSaldoFinal');
    elSaldo.innerText = brl(saldoFinal);
    elSaldo.style.color = saldoFinal < 0 ? 'var(--danger)' : '#166534';
    let cardSaldo = elSaldo.closest('.kpi-card');
    if (cardSaldo) {
        cardSaldo.removeAttribute('title'); 
        cardSaldo.dataset.kpiTooltip = `CÁLCULO DO SALDO FINAL\n\n(+) Geração Líquida: ${brl(geracaoLiquida)}\n(±) Empréstimos Líquidos: ${brl(emp)}\n\n(=) Saldo Final: ${brl(saldoFinal)}`;
        cardSaldo.style.cursor = 'help';
    }

    // Ajusta o texto da legenda de acordo com o filtro selecionado
    let txtMeses = (mesFiltro === 'todos' || !mesFiltro) ? `${mesesAtivos}/12 meses com registro` : `Visualizando apenas o mês selecionado`;
    document.getElementById('kpiMesesFechados').innerText = txtMeses;

    let elGL = document.getElementById('kpiGeracaoLiquida');
    elGL.innerText = brl(geracaoLiquida);
    elGL.style.color = geracaoLiquida < 0 ? 'var(--danger)' : 'var(--text)';
    let cardGL = elGL.closest('.kpi-card');
    if (cardGL) {
        cardGL.removeAttribute('title');
        cardGL.dataset.kpiTooltip = `CÁLCULO DA GERAÇÃO LÍQUIDA\n\n(+) ROL: ${brl(rol)}\n(-) Custos (CSV): ${brl(custos)}\n(-) Desp. Operacionais: ${brl(desp)}\n(±) Resultado Financeiro: ${brl(fin)}\n(-) Impostos: ${brl(imp)}\n(-) Sócios: ${brl(soc)}\n(-) CAPEX: ${brl(capex)}\n\n(=) Geração Líquida: ${brl(geracaoLiquida)}`;
        cardGL.style.cursor = 'help';
    }

    let elBurn = document.getElementById('kpiBurnRate');
    elBurn.innerText = brl(burnRate);
    let cardBurn = elBurn.closest('.kpi-card');
    if (cardBurn) {
        cardBurn.removeAttribute('title');
        cardBurn.dataset.kpiTooltip = `CÁLCULO DO BURN RATE (Queima Média)\n\n(+) Despesas Variáveis/Extras: ${brl(totalDespVar)}\n(+) Custos (CSV): ${brl(custos)}\n(+) Desp. Operacionais: ${brl(desp)}\n\n(=) Total Saídas Operacionais: ${brl(totalBurn)}\n(÷) Divisor Mensal: ${mesesAtivos}\n\n(=) Burn Rate: ${brl(burnRate)}`;
        cardBurn.style.cursor = 'help';
    }

    let elRunway = document.getElementById('kpiRunway');
    elRunway.innerText = `${runway} Meses`;
    let cardRunway = elRunway.closest('.kpi-card');
    if (cardRunway) {
        cardRunway.removeAttribute('title');
        cardRunway.dataset.kpiTooltip = `CÁLCULO DO RUNWAY (Fôlego de Caixa)\n\nSaldo em Caixa Atual: ${brl(saldoFinal)}\n(÷) Queima Mensal (Burn Rate): ${brl(burnRate)}\n\n(=) Tempo de Sobrevivência: ${runway} meses`;
        cardRunway.style.cursor = 'help';
    }

    initCustomTooltip();
}

function initCustomTooltip() {
    let tooltip = document.getElementById('kpi-custom-tooltip');
    
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'kpi-custom-tooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.background = '#1e293b'; 
        tooltip.style.color = '#f8fafc';
        tooltip.style.padding = '12px 16px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.fontSize = '13px';
        tooltip.style.lineHeight = '1.6';
        tooltip.style.pointerEvents = 'none'; 
        tooltip.style.zIndex = '999999';
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.2s ease';
        tooltip.style.whiteSpace = 'pre-wrap'; 
        tooltip.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
        document.body.appendChild(tooltip);
    }

    document.querySelectorAll('.kpi-card').forEach(card => {
        if (!card.dataset.kpiTooltip) return;

        card.addEventListener('mouseenter', () => {
            tooltip.innerText = card.dataset.kpiTooltip;
            tooltip.style.opacity = '1';
        });

        card.addEventListener('mousemove', (e) => {
            let x = e.clientX + 15; 
            let y = e.clientY + 15;
            
            const w = tooltip.offsetWidth;
            const h = tooltip.offsetHeight;
            if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
            if (y + h > window.innerHeight - 10) y = e.clientY - h - 15;

            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        card.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });
    });
}

// ==========================================
// 3. CHART: WATERFALL (PONTE)
// ==========================================
function renderWaterfall(tree) {
    const ctx = document.getElementById('chartWaterfall').getContext('2d');
    if (charts.waterfall) charts.waterfall.destroy();

    let vRecLiq = tree.getM('grp_recebimentos');
    let vDed = tree.masters['grp_recebimentos']?.headers['deducoes']?.total || 0;
    let vRec = vRecLiq + vDed; 
    
    let custosVarNet = tree.getM('grp_custos_var');
    let despVar = tree.masters['grp_custos_var']?.headers['desp_var']?.total || 0;
    let custos = tree.masters['grp_custos_var']?.headers['custos']?.total || 0;
    let recDesp = tree.masters['grp_custos_var']?.headers['rec_desp']?.total || 0;
    let customCustosVar = custosVarNet - (despVar + custos - recDesp);
    
    let vDespVar = -(despVar + customCustosVar);
    let vRecDesp = recDesp;
    let vCus = -custos;

    let vDesp = -tree.getM('grp_desp_op');
    let vFin = tree.getM('grp_financeiro'); 
    let vImp = -tree.getM('grp_impostos');
    let vSoc = -tree.getM('grp_socios');
    let vCap = -tree.getM('grp_capex');
    let vEmp = tree.getM('grp_emprestimos');

    let steps = [];
    let current = 0;

    const pushStep = (val) => {
        let end = current + val;
        steps.push([current, end]);
        current = end;
    };

    pushStep(vRec);      
    pushStep(-vDed);      
    pushStep(vDespVar);  
    pushStep(vRecDesp);  
    pushStep(vCus);      
    pushStep(vDesp);     
    pushStep(vFin);      
    pushStep(vImp);      
    pushStep(vSoc);      
    pushStep(vCap);      
    pushStep(vEmp);      

    steps.push([0, current]);

    const labels = ["Rec. Bruta", "Deduções", "Desp. Var", "Rec. Desp", "Custos", "Desp. Op.", "Financeiro", "Impostos", "Sócios", "Capex", "Empréstimos", "SALDO FINAL"];
    
    const bgColors = steps.map((s, i) => {
        if (i === 11) return '#0f2f4a'; 
        return s[1] >= s[0] ? '#166534' : '#d92d20'; 
    });

    charts.waterfall = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Fluxo (R$)',
                data: steps,
                backgroundColor: bgColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            let diff = ctx.raw[1] - ctx.raw[0];
                            return ` Valor: ${brl(diff)}`;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// 4. CHART: BARRAS LADO A LADO (ENTRADAS VS SAÍDAS)
// ==========================================
function renderInOutBars(tree, mesFiltro) {
    const ctx = document.getElementById('chartStacked').getContext('2d');
    if (charts.stacked) charts.stacked.destroy();

    let labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    
    let entradas = new Array(12).fill(0);
    let saidas = new Array(12).fill(0);
    
    for (let m = 1; m <= 12; m++) {
        let recGrp = tree.masters['grp_recebimentos'];
        if(recGrp) {
            let rLiq = recGrp.meses[m];
            let ded = recGrp.headers['deducoes']?.meses[m] || 0;
            entradas[m-1] += (rLiq + ded);
            saidas[m-1] += ded; 
        }
        
        let cvGrp = tree.masters['grp_custos_var'];
        if(cvGrp) {
            let cvNet = cvGrp.meses[m];
            let dVar = cvGrp.headers['desp_var']?.meses[m] || 0;
            let cus = cvGrp.headers['custos']?.meses[m] || 0;
            let rDesp = cvGrp.headers['rec_desp']?.meses[m] || 0;
            let cCustom = cvNet - (dVar + cus - rDesp);

            saidas[m-1] += (dVar + cCustom); 
            saidas[m-1] += cus;              
            entradas[m-1] += rDesp;
        }

        if(tree.masters['grp_desp_op']) saidas[m-1] += tree.masters['grp_desp_op'].meses[m];
        if(tree.masters['grp_impostos']) saidas[m-1] += tree.masters['grp_impostos'].meses[m];
        if(tree.masters['grp_socios']) saidas[m-1] += tree.masters['grp_socios'].meses[m];
        if(tree.masters['grp_capex']) saidas[m-1] += tree.masters['grp_capex'].meses[m];

        let fin = tree.masters['grp_financeiro'];
        if(fin) {
            for (const [hSlug, hData] of Object.entries(fin.headers)) {
                let isSub = (hSlug !== 'fin_entrada');
                if (isSub) saidas[m-1] += hData.meses[m]; 
                else entradas[m-1] += hData.meses[m];
            }
        }

        let emp = tree.masters['grp_emprestimos'];
        if(emp) {
            for (const [hSlug, hData] of Object.entries(emp.headers)) {
                let isSub = (hSlug !== 'emp_entrada');
                if (isSub) saidas[m-1] += hData.meses[m]; 
                else entradas[m-1] += hData.meses[m];
            }
        }
    }

    // Inteligência de UI: Dá destaque ('foco') à barra se um mês específico for selecionado
    let bgEntradas = new Array(12).fill('#166534');
    let bgSaidas = new Array(12).fill('#d92d20');

    if (mesFiltro && mesFiltro !== 'todos') {
        let mIdx = parseInt(mesFiltro) - 1;
        bgEntradas = bgEntradas.map((c, i) => i === mIdx ? '#166534' : '#bbf7d0'); 
        bgSaidas = bgSaidas.map((c, i) => i === mIdx ? '#d92d20' : '#fecaca');
    }

    charts.stacked = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { 
                    label: 'Entradas', 
                    data: entradas, 
                    backgroundColor: bgEntradas,
                    borderRadius: 4 
                },
                { 
                    label: 'Saídas', 
                    data: saidas, 
                    backgroundColor: bgSaidas,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                tooltip: { 
                    callbacks: { 
                        label: c => ` ${c.dataset.label}: ${brl(c.raw)}` 
                    } 
                } 
            },
            scales: {
                y: { 
                    ticks: { callback: v => brl(v) } 
                },
                x: {} 
            }
        }
    });
}

// ==========================================
// 5. CHART: YoY (EBITDA MENSAL)
// ==========================================
function renderYoY(tree1, tree2, ano1, ano2, mesFiltro) {
    const ctx = document.getElementById('chartYoY').getContext('2d');
    if (charts.yoy) charts.yoy.destroy();

    let labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    
    const calcEBITDA = (t) => {
        let arr = [];
        if (!t) return new Array(12).fill(0);
        for (let m = 1; m <= 12; m++) {
            let recLiq = t.masters['grp_recebimentos'] ? t.masters['grp_recebimentos'].meses[m] : 0;

            let cvGrp = t.masters['grp_custos_var'];
            let cvNet = cvGrp ? cvGrp.meses[m] : 0;
            let dVar = cvGrp?.headers['desp_var']?.meses[m] || 0;
            let cus = cvGrp?.headers['custos']?.meses[m] || 0;
            let rDesp = cvGrp?.headers['rec_desp']?.meses[m] || 0;
            let cCustom = cvNet - (dVar + cus - rDesp);

            let rol = recLiq - (dVar + cCustom) + rDesp;
            let mcb = rol - cus;

            let desp = t.masters['grp_desp_op'] ? t.masters['grp_desp_op'].meses[m] : 0;
            
            arr.push(mcb - desp);
        }
        return arr;
    };

    let data1 = calcEBITDA(tree1);
    let data2 = tree2 ? calcEBITDA(tree2) : [];

    // Foco no gráfico YoY também
    let bgAno1 = new Array(12).fill('#0f2f4a');
    let bgAno2 = new Array(12).fill('#cbd5e1');

    if (mesFiltro && mesFiltro !== 'todos') {
        let mIdx = parseInt(mesFiltro) - 1;
        bgAno1 = bgAno1.map((c, i) => i === mIdx ? '#0f2f4a' : '#e2e8f0');
        bgAno2 = bgAno2.map((c, i) => i === mIdx ? '#cbd5e1' : '#f1f5f9');
    }

    let datasets = [{
        label: `EBITDA ${ano1}`,
        data: data1,
        backgroundColor: bgAno1,
        borderRadius: 4
    }];

    if (ano2) {
        datasets.push({
            label: `EBITDA ${ano2}`,
            data: data2,
            backgroundColor: bgAno2,
            borderRadius: 4
        });
    }

    charts.yoy = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${brl(c.raw)}` } } },
            scales: { y: { ticks: { callback: v => brl(v) } } }
        }
    });
}

// ==========================================
// 6. CHART: PARETO 80/20 (TOP MOVIMENTAÇÕES)
// ==========================================
function renderPareto(tree) {
    const ctx = document.getElementById('chartPareto').getContext('2d');
    if (charts.pareto) charts.pareto.destroy();

    let todasContas = [];
    Object.values(tree.contasMap).forEach(ref => {
        if (ref.conta.total !== 0) {
            todasContas.push({ name: `${ref.conta.codigo} - ${ref.conta.nome}`, val: Math.abs(ref.conta.total) });
        }
    });

    todasContas.sort((a, b) => b.val - a.val);

    let top10 = todasContas.slice(0, 10);
    let outros = todasContas.slice(10).reduce((acc, curr) => acc + curr.val, 0);
    
    if (outros > 0) top10.push({ name: 'OUTRAS CONTAS (Agrupado)', val: outros });

    let totalGeral = top10.reduce((acc, curr) => acc + curr.val, 0);

    let labels = [];
    let barData = [];
    let lineData = []; 
    let acc = 0;

    top10.forEach(item => {
        labels.push(item.name.length > 25 ? item.name.substring(0, 25) + "..." : item.name);
        barData.push(item.val);
        acc += item.val;
        lineData.push((acc / totalGeral) * 100);
    });

    charts.pareto = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: '% Acumulado',
                    data: lineData,
                    borderColor: '#b02228',
                    backgroundColor: '#b02228',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.2
                },
                {
                    type: 'bar',
                    label: 'Movimentação (R$ Absoluto)',
                    data: barData,
                    backgroundColor: '#123a5a',
                    yAxisID: 'y',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { type: 'linear', display: true, position: 'left', ticks: { callback: v => brl(v) } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
            }
        }
    });
}

// ==========================================
// 7. EXPLORADOR & ANÁLISE VERTICAL
// ==========================================
function renderExplorerTree(tree) {
    const container = document.getElementById('explorerTree');
    container.innerHTML = '';

    let receitaLiquida = tree.getM('grp_recebimentos');
    if (receitaLiquida === 0) receitaLiquida = 1; 

    const getPerc = (val) => {
        return ((val / receitaLiquida) * 100).toFixed(2) + '%';
    };

    let html = '<ul class="explorer-list">';

    for (const [mSlug, mData] of Object.entries(tree.masters)) {
        if (mData.total === 0 && Object.keys(mData.headers).length === 0) continue;

        let overrideName = mData.texto;
        if (mSlug === 'grp_recebimentos') overrideName = '1. RECEBIMENTOS (Líquido)';

        html += `
            <li class="exp-item-master">
                <div class="exp-row master-row" onclick="this.parentElement.classList.toggle('open')">
                    <div class="exp-title"><i class="fa-solid fa-chevron-right chevron"></i> ${overrideName}</div>
                    <div class="exp-metrics">
                        <span class="exp-val">${brl(mData.total)}</span>
                        <span class="exp-perc badge">${getPerc(mData.total)}</span>
                    </div>
                </div>
                <ul class="exp-sublist">
        `;

        for (const [hSlug, hData] of Object.entries(mData.headers)) {
            if (hData.total === 0 && hData.contas.length === 0) continue;

            html += `
                <li class="exp-item-header">
                    <div class="exp-row header-row" onclick="this.parentElement.classList.toggle('open')">
                        <div class="exp-title"><i class="fa-solid fa-chevron-right chevron"></i> ${hData.texto}</div>
                        <div class="exp-metrics">
                            <span class="exp-val">${brl(hData.total)}</span>
                            <span class="exp-perc badge">${getPerc(hData.total)}</span>
                        </div>
                    </div>
                    <ul class="exp-sublist">
            `;

            hData.contas.forEach(conta => {
                if (conta.total === 0) return;
                html += `
                    <li class="exp-item-conta">
                        <div class="exp-row conta-row">
                            <div class="exp-title">${conta.codigo} - ${conta.nome}</div>
                            <div class="exp-metrics">
                                <span class="exp-val">${brl(conta.total)}</span>
                                <span class="exp-perc badge-light">${getPerc(conta.total)}</span>
                            </div>
                        </div>
                    </li>
                `;
            });

            html += `</ul></li>`; 
        }
        html += `</ul></li>`; 
    }

    html += '</ul>';
    container.innerHTML = html;
}