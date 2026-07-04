import { runPipeline } from '../pipeline.js';
import { logger } from '../utils/logger.js';
import * as readline from 'node:readline';

// Configuração padrão do Pomodoro
const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;

// Lista de tarefas (keyword, city) - pode ser customizada via argumentos ou arquivo
const DEFAULT_TASKS = [
  { keyword: 'advocacia', city: 'São Paulo', niche: 'advocacia', region: 'SP', maxLeads: 20, searchType: 'organic' as const },
  { keyword: 'contabilidade', city: 'São Paulo', niche: 'contabilidade', region: 'SP', maxLeads: 20, searchType: 'organic' as const },
  { keyword: 'consultoria', city: 'Rio de Janeiro', niche: 'consultoria', region: 'RJ', maxLeads: 20, searchType: 'organic' as const },
  { keyword: 'clínica médica', city: 'Belo Horizonte', niche: 'saúde', region: 'MG', maxLeads: 20, searchType: 'organic' as const },
  { keyword: 'escritório de arquitetura', city: 'Curitiba', niche: 'arquitetura', region: 'PR', maxLeads: 20, searchType: 'organic' as const },
];

interface Task {
  keyword: string;
  city: string;
  niche: string;
  region: string;
  maxLeads?: number;
  searchType: 'organic' | 'paid' | 'maps';
}

/**
 * Espera por um determinado número de milissegundos
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formata o tempo restante em minutos e segundos
 */
function formatTimeLeft(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Executa uma tarefa de caça a leads dentro do tempo de trabalho especificado
 */
async function runTask(task: Task, workDurationMs: number): Promise<{ leadsCount: number; completedEarly: boolean }> {
  const startTime = Date.now();
  logger.info(`🔹 Iniciando tarefa: ${task.keyword} em ${task.city} (${task.region})`);
  
  try {
    const result = await runPipeline({
      keyword: task.keyword,
      city: task.city,
      niche: task.niche,
      region: task.region,
      maxLeads: task.maxLeads ?? 20,
      searchType: task.searchType,
    });
    
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, workDurationMs - elapsed);
    
    logger.info(`✅ Tarefa concluída: ${result.leads.length} leads encontrados em ${formatTimeLeft(elapsed * -1)} restante`);
    
    // Se terminou antes do tempo, aguarda o restante do período de trabalho
    if (remainingTime > 0) {
      logger.info(`⏳ Aguardando ${formatTimeLeft(remainingTime)} para completar o Pomodoro de trabalho...`);
      await sleep(remainingTime);
      return { leadsCount: result.leads.length, completedEarly: true };
    }
    
    return { leadsCount: result.leads.length, completedEarly: false };
  } catch (error) {
    logger.error(`❌ Erro na tarefa ${task.keyword} em ${task.city}:`, error);
    // Mesmo com erro, consideramos que o tempo de trabalho foi usado
    return { leadsCount: 0, completedEarly: false };
  }
}

/**
 * Exibe uma contagem regressiva para o intervalo
 */
async function showBreakCountdown(minutes: number): Promise<void> {
  const totalMs = minutes * 60 * 1000;
  const startTime = Date.now();
  
  logger.info(`☕ Iniciando intervalo de ${minutes} minutos...`);
  
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

/**
 * Função principal que orquestra os Pomodoros
 */
async function runPomodoroWorkflow() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  logger.info('🍅 Iniciando modo Pomodoro para Lead Hunter IA');
  logger.info(`   ⏰ Trabalho: ${WORK_MINUTES} min | Intervalo: ${BREAK_MINUTES} min`);
  logger.info(`   📋 Tarefas planejadas: ${DEFAULT_TASKS.length}`);
  
  // Pergunta se quer usar as tarefas padrão ou personalizar
  const useDefault = await new Promise<boolean>(resolve => {
    rl.question('Usar lista padrão de tarefas? (S/n): ', answer => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 's' || normalized === 'sim' || normalized === 'y' || normalized === 'yes');
    });
  });
  
  let tasks: Task[] = [];
  
  if (useDefault) {
    tasks = DEFAULT_TASKS;
    logger.info(`📝 Usando ${tasks.length} tarefas padrão`);
  } else {
    // Modo interativo para adicionar tarefas (simplificado)
    logger.info('📝 Modo personalizado: digite as tarefas (keyword city niche region) ou "fim" para terminar');
    
    while (true) {
      const answer = await new Promise<string>(resolve => {
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
          searchType: 'organic' as const
        });
        logger.info(`✅ Tarefa adicionada: ${parts[0]} em ${parts[1]} (${parts[2]}, ${parts[3]})`);
      } else {
        logger.info('⚠️ Formato inválido. Use: keyword city niche region (ex: advocacia São Paulo advocacia SP)');
      }
    }
    
    if (tasks.length === 0) {
      logger.info('⚠️ Nenhuma tarefa adicionada. Usando lista padrão.');
      tasks = DEFAULT_TASKS;
    }
  }
  
  rl.close();
  
  // Estatísticas gerais
  const stats = {
    totalTasks: tasks.length,
    completedTasks: 0,
    totalLeads: 0,
    startTime: new Date()
  };
  
  logger.info(`🚀 Iniciando ${tasks.length} Pomodoros de trabalho...\n`);
  
  // Executa cada tarefa como um Pomodoro
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const pomodoroNumber = i + 1;
    
    logger.info(`\n🍅 Pomodoro ${pomodoroNumber}/${tasks.length}`);
    logger.info(`   🎯 Foco: ${task.keyword} em ${task.city} (${task.region})`);
    
    try {
      const result = await runTask(task, WORK_MINUTES * 60 * 1000);
      stats.completedTasks++;
      stats.totalLeads += result.leadsCount;
      
      // Se não for a última tarefa, faz o intervalo
      if (i < tasks.length - 1) {
        await showBreakCountdown(BREAK_MINUTES);
      }
    } catch (error) {
      logger.error(`❌ Erro fatal no Pomodoro ${pomodoroNumber}:`, error);
      // Continua para a próxima tarefa mesmo com erro
      if (i < tasks.length - 1) {
        await showBreakCountdown(BREAK_MINUTES);
      }
    }
  }
  
  // Resumo final
  const endTime = new Date();
  const durationMs = endTime.getTime() - stats.startTime.getTime();
  const durationMin = Math.floor(durationMs / 60000);
  
  logger.info('\n📊 RESUMO FINAL DO MODO POMODORO:');
  logger.info(`   ⏱️  Tempo total: ${durationMin} minutos`);
  logger.info(`   ✅ Tarefas concluídas: ${stats.completedTasks}/${stats.totalTasks}`);
  logger.info(`   🎯 Total de leads capturados: ${stats.totalLeads}`);
  logger.info(`   📈 Média de leads por Pomodoro: ${(stats.totalLeads / stats.completedTasks).toFixed(1)}`);
  
  if (stats.totalLeads > 0) {
    logger.info(`\n💡 Dica: Use 'npm run db:studio' para visualizar os leads capturados ou 'npm run web' para acessar o painel.`);
  }
  
  logger.info('\n👋 Trabalho concluído! Volte sempre que precisar de mais foco produtivo.\n');
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