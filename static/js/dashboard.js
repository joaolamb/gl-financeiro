// dashboard.js - Motor Analítico Dinâmico para DFC

// Regras de negócio (ID's do setup do DB original)
const regrasSubtracaoHeader = ['deducoes', 'rec_desp', 'fin_saida', 'emp_saida'];

// Instâncias ativas do Chart.js
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
});

async function updateDashboard() {
    const ano1 = document.getElementById('ano1').value;
    const ano2 = document.getElementById('ano2').value;
    
    // Mostra loading nos cards
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

    // Processamento Inteligente de Dados
    const procAno1 = processDataTree(data.layout, data.data_ano1);
    const procAno2 = ano2 ? processDataTree(data.layout, data.data_ano2) : null;

    // Renderizar componentes
    renderKPIs(procAno1, data.data_ano1);
    renderWaterfall(procAno1);
    renderStackedBars(procAno1);
    renderYoY(procAno1, procAno2, ano1, ano2);
    renderPareto(procAno1);
    renderExplorerTree(procAno1);
}

// ==========================================
// 1. MOTOR DE PROCESSAMENTO (DATA ENGINE)
// ==========================================
function processDataTree(layout, lancamentos) {
    // Inicializa a árvore
    let tree = {
        masters: {}, // { "grp_recebimentos": { texto, total, meses[], headers: {} } }
        contasMap: {} // mapeia cat_id -> ponteiro para a conta na arvore
    };

    let activeMaster = null;
    let activeHeader = null;

    // Constrói a estrutura baseada na Ordem do Layout
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

    // Popula com os valores dos Lançamentos
    lancamentos.forEach(lanc => {
        let ref = tree.contasMap[lanc.cat_id];
        if (!ref) return;

        let val = lanc.valor;
        let m = lanc.mes;

        // Atualiza Conta
        ref.conta.total += val;
        ref.conta.meses[m] += val;

        // Atualiza Header
        let hObj = tree.masters[ref.master].headers[ref.header];
        hObj.total += val;
        hObj.meses[m] += val;

        // Atualiza Master (Aplica regras de inversão de sinal da DFC)
        let mObj = tree.masters[ref.master];
        if (regrasSubtracaoHeader.includes(ref.header)) {
            mObj.total -= val;
            mObj.meses[m] -= val;
        } else {
            mObj.total += val;
            mObj.meses[m] += val;
        }
    });

    // Helpers globais para a árvore
    tree.getM = (masterSlug) => tree.masters[masterSlug] ? tree.masters[masterSlug].total : 0;
    
    return tree;
}

// ==========================================
// 2. KPIS GERAIS
// ==========================================
function renderKPIs(tree, lancamentos) {
    // Calcula meses fechados (meses com movimentação > 0)
    let mesesAtivos = new Set(lancamentos.map(l => l.mes)).size;
    if (mesesAtivos === 0) mesesAtivos = 1; // Prevenção de divisão por zero

    // 1. Geração Líquida (Até Capex)
    let rec = tree.getM('grp_recebimentos');
    let custos = tree.getM('grp_custos_var');
    let desp = tree.getM('grp_desp_op');
    let fin = tree.getM('grp_financeiro'); // Já líquido
    let imp = tree.getM('grp_impostos');
    let soc = tree.getM('grp_socios');
    let capex = tree.getM('grp_capex');
    
    let geracaoLiquida = rec - custos - desp + fin - imp - soc - capex;

    // 2. Saldo Final (Geração Líquida + Empréstimos Líquidos)
    let emp = tree.getM('grp_emprestimos');
    let saldoFinal = geracaoLiquida + emp;

    // 3. Burn Rate (Média de Saídas Operacionais)
    // Burn Rate = (Custos + Despesas Op) / meses ativos
    let totalBurn = custos + desp; 
    let burnRate = totalBurn / mesesAtivos;

    // 4. Runway
    let runway = burnRate > 0 ? (saldoFinal / burnRate).toFixed(1) : "N/A ";

    // Injeção na Tela
    document.getElementById('kpiSaldoFinal').innerText = brl(saldoFinal);
    document.getElementById('kpiSaldoFinal').style.color = saldoFinal < 0 ? 'var(--danger)' : '#166534';
    document.getElementById('kpiMesesFechados').innerText = `${mesesAtivos}/12 meses com registro`;

    document.getElementById('kpiGeracaoLiquida').innerText = brl(geracaoLiquida);
    document.getElementById('kpiGeracaoLiquida').style.color = geracaoLiquida < 0 ? 'var(--danger)' : 'var(--text)';

    document.getElementById('kpiBurnRate').innerText = brl(burnRate);

    document.getElementById('kpiRunway').innerText = `${runway} Meses`;
}

// ==========================================
// 3. CHART: WATERFALL (PONTE)
// ==========================================
function renderWaterfall(tree) {
    const ctx = document.getElementById('chartWaterfall').getContext('2d');
    if (charts.waterfall) charts.waterfall.destroy();

    // Valores formatados conforme a DFC Clássica (Sinais matemáticos para o Waterfall)
    let vRec = tree.getM('grp_recebimentos');
    let vCus = -tree.getM('grp_custos_var');
    let vDesp = -tree.getM('grp_desp_op');
    let vFin = tree.getM('grp_financeiro'); 
    let vImp = -tree.getM('grp_impostos');
    let vSoc = -tree.getM('grp_socios');
    let vCap = -tree.getM('grp_capex');
    let vEmp = tree.getM('grp_emprestimos');

    // Construção dos 'Degraus' (Start, End)
    let steps = [];
    let current = 0;

    const pushStep = (val) => {
        let end = current + val;
        steps.push([current, end]);
        current = end;
    };

    pushStep(vRec);  // 1. Receitas Líquidas
    pushStep(vCus);  // 2. Custos
    pushStep(vDesp); // 3. Despesas
    pushStep(vFin);  // 4. Financeiro
    pushStep(vImp);  // 5. Impostos
    pushStep(vSoc);  // 6. Sócios
    pushStep(vCap);  // 7. Capex
    pushStep(vEmp);  // 8. Empréstimos

    // 9. Saldo Final (Barra Total que parte do 0)
    steps.push([0, current]);

    const labels = ["Receitas", "Custos", "Desp. Op.", "Financeiro", "Impostos", "Sócios", "Capex", "Empréstimos", "SALDO FINAL"];
    
    // Cores: Verde (Entrou), Vermelho (Saiu), Azul (Totais)
    const bgColors = steps.map((s, i) => {
        if (i === 8) return '#0f2f4a'; // Total Final
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
// 4. CHART: STACKED BARS (MENSAL)
// ==========================================
function renderStackedBars(tree) {
    const ctx = document.getElementById('chartStacked').getContext('2d');
    if (charts.stacked) charts.stacked.destroy();

    let labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    
    // Arrays mensais (1 a 12)
    let entradas = new Array(12).fill(0);
    let saidas = new Array(12).fill(0);

    // Mapeamento rudimentar: O que é Entrada e Saída
    // Entradas: Recebimentos, Entradas Fin (header fin_entrada), Entradas Emp (header emp_entrada)
    // Saídas: Restante
    
    for (let m = 1; m <= 12; m++) {
        // Recebimentos é tratado como Entrada pura (bruta) aqui para visualização
        if(tree.masters['grp_recebimentos']) entradas[m-1] += tree.masters['grp_recebimentos'].meses[m];
        
        // Saídas Operacionais
        if(tree.masters['grp_custos_var']) saidas[m-1] -= tree.masters['grp_custos_var'].meses[m];
        if(tree.masters['grp_desp_op']) saidas[m-1] -= tree.masters['grp_desp_op'].meses[m];
        if(tree.masters['grp_impostos']) saidas[m-1] -= tree.masters['grp_impostos'].meses[m];
        if(tree.masters['grp_socios']) saidas[m-1] -= tree.masters['grp_socios'].meses[m];
        if(tree.masters['grp_capex']) saidas[m-1] -= tree.masters['grp_capex'].meses[m];

        // Múltiplos Headers dentro de Fin/Emp
        let fin = tree.masters['grp_financeiro'];
        if(fin) {
            if(fin.headers['fin_entrada']) entradas[m-1] += fin.headers['fin_entrada'].meses[m];
            if(fin.headers['fin_saida']) saidas[m-1] -= fin.headers['fin_saida'].meses[m]; // Fica negativo visualmente
        }

        let emp = tree.masters['grp_emprestimos'];
        if(emp) {
            if(emp.headers['emp_entrada']) entradas[m-1] += emp.headers['emp_entrada'].meses[m];
            if(emp.headers['emp_saida']) saidas[m-1] -= emp.headers['emp_saida'].meses[m];
        }
    }

    charts.stacked = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Entradas', data: entradas, backgroundColor: '#166534', stack: 'Stack 0' },
                { label: 'Saídas', data: saidas, backgroundColor: '#d92d20', stack: 'Stack 0' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { stacked: true, ticks: { callback: v => brl(v) } },
                x: { stacked: true }
            }
        }
    });
}

// ==========================================
// 5. CHART: YoY (EBITDA MENSAL)
// ==========================================
function renderYoY(tree1, tree2, ano1, ano2) {
    const ctx = document.getElementById('chartYoY').getContext('2d');
    if (charts.yoy) charts.yoy.destroy();

    let labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    
    // Calcula EBITDA Mensal (Recebimentos - Custos - Desp_Op)
    const calcEBITDA = (t) => {
        let arr = [];
        if (!t) return new Array(12).fill(0);
        for (let m = 1; m <= 12; m++) {
            let rec = t.masters['grp_recebimentos'] ? t.masters['grp_recebimentos'].meses[m] : 0;
            let cus = t.masters['grp_custos_var'] ? t.masters['grp_custos_var'].meses[m] : 0;
            let desp = t.masters['grp_desp_op'] ? t.masters['grp_desp_op'].meses[m] : 0;
            arr.push(rec - cus - desp);
        }
        return arr;
    };

    let data1 = calcEBITDA(tree1);
    let data2 = tree2 ? calcEBITDA(tree2) : [];

    let datasets = [{
        label: `EBITDA ${ano1}`,
        data: data1,
        backgroundColor: '#0f2f4a',
        borderRadius: 4
    }];

    if (ano2) {
        datasets.push({
            label: `EBITDA ${ano2}`,
            data: data2,
            backgroundColor: '#cbd5e1',
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

    // Reúne todas as contas, pega valores absolutos
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
    let lineData = []; // Acumulado %
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

    // A Receita Líquida é a base 100% da Análise Vertical
    let receitaLiquida = tree.getM('grp_recebimentos');
    if (receitaLiquida === 0) receitaLiquida = 1; // Prevenir divisão por zero

    const getPerc = (val) => {
        return ((val / receitaLiquida) * 100).toFixed(2) + '%';
    };

    let html = '<ul class="explorer-list">';

    // Itera pelos Masters (Ordenados indiretamente por quem foi criado primeiro, ou seja, pelo ID/Ordem do layout no python)
    for (const [mSlug, mData] of Object.entries(tree.masters)) {
        if (mData.total === 0 && Object.keys(mData.headers).length === 0) continue;

        html += `
            <li class="exp-item-master">
                <div class="exp-row master-row" onclick="this.parentElement.classList.toggle('open')">
                    <div class="exp-title"><i class="fa-solid fa-chevron-right chevron"></i> ${mData.texto}</div>
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

            html += `</ul></li>`; // Fecha Header
        }
        html += `</ul></li>`; // Fecha Master
    }

    html += '</ul>';
    container.innerHTML = html;
}