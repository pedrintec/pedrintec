const { runPipeline } = require('../pipeline.js');
const { logger } = require('../utils/logger.js');
const readline = require('readline');

// Configuração padrão do Pomodoro
const WORK_MINUTES = 25;
const SHORT_BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 15;
const CYCLES_BEFORE_LONG_BREAK = 4;

// Função para esperar por um determinado número de milissegundos
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Formata o tempo restante em minutos e segundos
function formatTimeLeft(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Executa uma tarefa de caça a leads dentro do tempo de trabalho especificado com objetivo gamificado
async function runTask(task, workDurationMs) {
  const startTime = Date.now();
  // Define o objetivo gamificado baseado na tarefa
  const objective = `Analisar 3 empresas de ${task.niche} em ${task.city}`;
  
  logger.info(`🎯 OBJETIVO: ${objective}`);
  
  // Configura lembrete periódico do objetivo durante o trabalho
  const reminderIntervalMs = 5 * 60 * 1000; // 5 minutos
  let reminderTimer;
  
  const startReminder = () => {
    reminderTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = workDurationMs - elapsed;
      if (remaining > 0) {
        logger.info(`⏰ Lembrete: ${objective} (${formatTimeLeft(remaining)} restantes)`);
      }
    }, reminderIntervalMs);
  };
  
  const stopReminder = () => {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
  };
  
  try {
    startReminder();
    
    const result = await runPipeline({
      keyword: task.keyword,
      city: task.city,
      niche: task.niche,
      region: task.region || 'SP',
      maxLeads: task.maxLeads || 20,
      searchType: task.searchType || 'organic'
    });
    
    stopReminder();
    
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, workDurationMs - elapsed);
    
    logger.info(`✅ Tarefa concluída: ${result.leads.length} leads encontrados em ${formatTimeLeft(elapsed * -1)} restante`);
    
    // Verifica se o objetivo foi atingido (meta: 3 leads)
    const objectiveMet = result.leads.length >= 3;
    if (objectiveMet) {
      logger.info(`🎉 Objetivo atingido! Encontramos ${result.leads.length} leads (meta: 3)`);
    } else {
      logger.info(`😕 Objetivo não atingido: ${result.leads.length} leads encontrados (meta: 3)`);
    }
    
    // Se terminou antes do tempo, aguarda o restante do período de trabalho
    if (remainingTime > 0) {
      logger.info(`⏳ Aguardando ${formatTimeLeft(remainingTime)} para completar o Pomodoro de trabalho...`);
      await sleep(remainingTime);
      return { leadsCount: result.leads.length, completedEarly: true };
    }
    
    return { leadsCount: result.leads.length, completedEarly: false };
  } catch (error) {
    stopReminder();
    logger.error(`❌ Erro na tarefa ${task.keyword} em ${task.city}:`, error);
    return { leadsCount: 0, completedEarly: false };
  }
}

// Exibe uma contagem regressiva para o intervalo
async function showBreakCountdown(minutes, type) {
  const totalMs = minutes * 60 * 1000;
  const startTime = Date.now();
  
  logger.info(`${type === 'long' ? '🌴' : '☕'} Iniciando intervalo ${type === 'long' ? 'longo' : ''} de ${minutes} minutos...`);
  
  while (true) {
    const elapsed = Date.now() - startTime;
    const remaining = totalMs - elapsed;
    
    if (remaining <= 0) break;
    
    // Atualiza a cada 30 segundos para não poluir muito o log
    if (elapsed % 30000 < 100) { // Aproximadamente a cada 30s
      logger.info(`⏱️  Intervalo: ${formatTimeLeft(remaining)} restantes`);
    }
    
    await sleep(1000); // Verifica a cada segundo
  }
  
  logger.info(`✅ Intervalo terminado. Hora de trabalhar novamente!`);
}

// Função principal que orquestra os Pomodoros
async function runPomodoroWorkflow() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  logger.info('🍅 Iniciando modo Pomodoro para Lead Hunter IA');
  logger.info(`   ⏰ Trabalho: ${WORK_MINUTES} min | Intervalo curto: ${SHORT_BREAK_MINUTES} min | Intervalo longo: ${LONG_BREAK_MINUTES} min`);
  
  // Pergunta se quer usar as tarefas padrão ou personalizar
  const useDefault = await new Promise((resolve) => {
    rl.question('Usar lista padrão de tarefas? (S/n): ', answer => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 's' || normalized === 'sim' || normalized === 'y' || normalized === 'yes');
    });
  });
  
  let tasks = [];
  
  if (useDefault) {
    tasks = [
      { keyword: 'advocacia', city: 'São Paulo', niche: 'advocacia', region: 'SP' },
      { keyword: 'contabilidade', city: 'São Paulo', niche: 'contabilidade', region: 'SP' },
      { keyword: 'consultoria', city: 'Rio de Janeiro', niche: 'consultoria', region: 'RJ' },
      { keyword: 'clínica médica', city: 'Belo Horizonte', niche: 'saúde', region: 'MG' },
      { keyword: 'escritório de arquitetura', city: 'Curitiba', niche: 'arquitetura', region: 'PR' }
    ];
    logger.info(`📝 Usando ${tasks.length} tarefas padrão`);
  } else {
    // Modo interativo para adicionar tarefas (simplificado)
    logger.info('📝 Modo personalizado: digite as tarefas (keyword city niche region) ou "fim" para terminar');
    
    while (true) {
      const answer = await new Promise((resolve) => {
        rl.question('> ', resolve);
      });
      
      if (answer.trim().toLowerCase() === 'fim') break;
      
      const parts = answer.trim().split(/\s+/);
      if (parts.length >= 4) {
        tasks.push({
          keyword: parts[0],
          city: parts[1],
          niche: parts[2],
          region: parts[3],
          maxLeads: 20,
          searchType: 'organic'
        });
        logger.info(`✅ Tarefa adicionada: ${parts[0]} em ${parts[1]} (${parts[2]}, ${parts[3]})`);
      } else {
        logger.info('⚠️ Formato inválido. Use: keyword city niche region (ex: advocacia São Paulo advocacia SP)');
      }
    }
    
    if (tasks.length === 0) {
      logger.info('⚠️ Nenhuma tarefa adicionada. Usando lista padrão.');
      tasks = [
        { keyword: 'advocacia', city: 'São Paulo', niche: 'advocacia', region: 'SP' },
        { keyword: 'contabilidade', city: 'São Paulo', niche: 'contabilidade', region: 'SP' },
        { keyword: 'consultoria', city: 'Rio de Janeiro', niche: 'consultoria', region: 'RJ' },
        { keyword: 'clínica médica', city: 'Belo Horizonte', niche: 'saúde', region: 'MG' },
        { keyword: 'escritório de arquitetura', city: 'Curitiba', niche: 'arquitetura', region: 'PR' }
      ];
    }
  }
  
  rl.close();
  
  // Estatísticas gerais
  const stats = {
    totalTasks: tasks.length,
    completedTasks: 0,
    totalLeads: 0,
    pomodorosCompleted: 0,
    startTime: new Date()
  };
  
  logger.info(`🚀 Iniciando Pomodoros de trabalho... (${tasks.length} tarefas por ciclo)\n`);
  
  let currentTaskIndex = 0;
  let pomodoroCount = 0;
  
  // Loop principal de Pomodoros
  while (true) {
    // Se esgotamos as tarefas, reiniciamos a lista
    if (currentTaskIndex >= tasks.length) {
      currentTaskIndex = 0;
      logger.info('\n🔄 Reiniciando lista de tarefas...\n');
    }
    
    const task = tasks[currentTaskIndex];
    const pomodoroNumber = ++pomodoroCount;
    
    logger.info(`\n🍅 Pomodoro ${pomodoroNumber} - Tarefa ${currentTaskIndex + 1}/${tasks.length}`);
    logger.info(`   🎯 Foco: ${task.keyword} em ${task.city} (${task.region})`);
    
    try {
      const result = await runTask(task, WORK_MINUTES * 60 * 1000);
      stats.completedTasks++;
      stats.totalLeads += result.leadsCount;
      
      // Determina qual intervalo fazer
      const isLongBreak = (pomodoroCount % CYCLES_BEFORE_LONG_BREAK) === 0;
      
      if (isLongBreak) {
        await showBreakCountdown(LONG_BREAK_MINUTES, 'long');
      } else {
        await showBreakCountdown(SHORT_BREAK_MINUTES, 'short');
      }
    } catch (error) {
      logger.error(`❌ Erro fatal no Pomodoro ${pomodoroCount}:`, error);
      // Mesmo com erro, continuamos para o próximo pomodoro
      const isLongBreak = (pomodoroCount % CYCLES_BEFORE_LONG_BREAK) === 0;
      
      if (isLongBreak) {
        await showBreakCountdown(LONG_BREAK_MINUTES, 'long');
      } else {
        await showBreakCountdown(SHORT_BREAK_MINUTES, 'short');
      }
    }
    
    currentTaskIndex++;
    
    // Pergunta se quer continuar após cada ciclo (opcional)
    // Por enquanto, continuamos indefinidamente até interrupção manual
    // Em uma versão futura, poderíamos adicionar uma opção para sair após N pomodoros
  }
}

// Tratamento de interrupção graceful
process.on('SIGINT', async () => {
  logger.info('\n\n🛑 Interrupção detectada. Finalizando o Pomodoro atual...');
  process.exit(0);
});

// Executar se chamado diretamente
if (require.main === module) {
  runPomodoroWorkflow().catch(err => {
    logger.error('❌ Erro inesperado no modo Pomodoro:', err);
    process.exit(1);
  });
}

module.exports = { runPomodoroWorkflow };