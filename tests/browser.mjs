import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base=process.env.BOVINUS_TEST_URL??'http://127.0.0.1:3000';
const directory='output/playwright';
let debugPage;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,locale:'pt-BR'});
  const page=await context.newPage();
  debugPage=page;
  page.on('pageerror',e=>errors.push(e.message));
  const open=async(path,heading)=>{
    await page.goto(base+path);
    await page.getByRole('heading',{name:heading,exact:true}).waitFor({timeout:30000});
  };
  await open('/','Visão geral');
  await page.locator('.recharts-area').first().waitFor();
  await page.screenshot({path:directory+'/dashboard-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Financeiro',exact:true}).click();
  await page.getByRole('heading',{name:'Evolução do CMV alimentar'}).waitFor();
  await page.getByRole('button',{name:'Consumo e sobras'}).click();
  await page.getByRole('heading',{name:'Matriz de popularidade e aceitação'}).waitFor();
  await page.locator('.recharts-scatter-symbol').first().click();
  await page.getByRole('heading',{name:/Histórico de /}).waitFor();

  await open('/demonstracao','Demonstração guiada');
  for (const action of ['Criar comanda 0042','Registrar porções','Registrar prato de 580 g','Registrar sobras']) {
    await page.getByRole('button',{name:action,exact:true}).click();
  }
  assert.match(await page.locator('.finance-summary').innerText(),/13,88/);
  await page.getByRole('link',{name:'Ver impacto no dashboard'}).click();
  await page.waitForURL('**/dashboard?comanda=0042');
  await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  assert.match(await page.locator('.metrics-grid').first().innerText(),/52,14/);
  const comparison=page.getByRole('heading',{name:'Receita × custo alimentar',exact:true}).locator('xpath=ancestor::section[1]');
  const markers=comparison.locator('circle.recharts-area-dot[r="4"]');
  await markers.first().hover();
  assert.equal(await markers.count(),2);
  await comparison.getByText('R$ 52,14',{exact:true}).waitFor();
  await comparison.getByText('R$ 13,88',{exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar dados'}).click();
  const download=await downloadPromise;
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/"0042".*"580".*"13,88"/);
  assert.equal(csv.split('\r\n').length,2);
  await page.getByRole('button',{name:'30 dias',exact:true}).click();
  await page.getByRole('button',{name:'Financeiro',exact:true}).click();
  const cmv=page.getByRole('heading',{name:'Evolução do CMV alimentar',exact:true}).locator('xpath=ancestor::section[1]');
  await cmv.locator('circle.recharts-line-dot').waitFor();

  await open('/comandas','Comandas');
  await page.getByRole('button',{name:'Nova comanda'}).click();
  await page.getByLabel('Número da comanda',{exact:true}).fill('9042');
  await page.getByRole('button',{name:'Criar comanda',exact:true}).click();
  await page.getByRole('heading',{name:'Comanda #9042',exact:true}).waitFor();
  const ticketUrl=page.url();
  await page.getByRole('button',{name:'Adicionar prato'}).click();
  await page.getByRole('heading',{name:'Prato 02',exact:true}).waitFor();
  const dish1=page.getByRole('heading',{name:'Prato 01',exact:true}).locator('xpath=ancestor::section[1]');
  await dish1.getByRole('link',{name:'Churrasqueira'}).click();
  await page.getByRole('button',{name:/Picanha/}).first().click();
  await page.getByRole('button',{name:'Acrescentar porção de Picanha'}).click();
  await page.getByRole('button',{name:'Remover porção de Picanha'}).click();
  await page.getByRole('button',{name:'Confirmar porções'}).click();
  await page.getByRole('status').filter({hasText:'Registro da churrasqueira salvo.'}).waitFor();
  await page.getByRole('link',{name:'Ver jornada da comanda'}).click();
  await dish1.getByRole('link',{name:'Pesagem'}).click();
  await page.getByRole('button',{name:'Lasanha',exact:true}).click();
  await page.getByLabel('Peso líquido total (g)').fill('40');
  await page.getByRole('alert').filter({hasText:'supera o peso líquido'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Salvar pesagem'}).isDisabled(),true);
  await page.getByLabel('Peso líquido total (g)').fill('420');
  await page.getByRole('button',{name:'Salvar pesagem'}).click();
  await page.getByRole('status').filter({hasText:'Pesagem e composição salvas.'}).waitFor();
  await page.getByRole('link',{name:'Ver jornada da comanda'}).click();
  await dish1.getByRole('link',{name:'Sobras'}).click();
  await page.getByLabel('Lasanha',{exact:true}).selectOption('grande');
  await page.getByRole('button',{name:'Salvar avaliação'}).click();
  await page.getByRole('status').filter({hasText:'Avaliação de sobras salva.'}).waitFor();
  await page.getByRole('button',{name:'Marcar todos sem sobras'}).click();
  await page.getByRole('button',{name:'Salvar avaliação'}).click();
  await page.getByRole('status').filter({hasText:'Avaliação de sobras salva.'}).waitFor();
  await page.getByRole('button',{name:'Descarte anônimo'}).click();
  await page.getByLabel('Alimento',{exact:true}).selectOption('lasanha');
  await page.getByRole('button',{name:'Registrar descarte'}).click();
  await page.getByRole('status').filter({hasText:'Descarte anônimo registrado.'}).waitFor();
  await page.getByRole('row').filter({hasText:'Lasanha'}).first().getByRole('button',{name:'Corrigir'}).click();
  await page.getByLabel('Intensidade observada').selectOption('grande');
  await page.getByRole('button',{name:'Salvar correção'}).click();
  await page.getByRole('status').filter({hasText:'Descarte corrigido.'}).waitFor();
  await page.goto(ticketUrl);
  await page.getByText('Lasanha · Sem sobra',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Encerrar sessão'}).click();
  await page.getByRole('button',{name:'Confirmar encerramento'}).click();
  await page.getByText(/Encerrada em/).waitFor();
  await page.reload();
  await page.getByText('Lasanha · Sem sobra',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Prato 02',exact:true}).waitFor();
  await open('/configuracoes','Configurações');
  await page.getByRole('button',{name:'Cardápio diário'}).click();
  await page.getByRole('button',{name:'Salvar cardápio'}).waitFor();
  await open('/relatorios','Relatórios');
  await page.getByRole('button',{name:'Descartes anônimos',exact:true}).click();
  await page.getByText('Não identificado',{exact:true}).first().waitFor();

  const tablet=await browser.newPage({viewport:{width:820,height:1060},hasTouch:true,locale:'pt-BR'});
  tablet.on('pageerror',e=>errors.push(e.message));
  await tablet.goto(base+'/dashboard');
  await tablet.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  assert.ok(await tablet.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await tablet.getByRole('button',{name:'Recolher menu'}).click();
  await tablet.getByRole('button',{name:'Expandir menu'}).waitFor();
  await tablet.close();

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true,locale:'pt-BR'});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base+'/');
  await mobile.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await mobile.screenshot({path:directory+'/dashboard-mobile.png',fullPage:true});
  await mobile.getByRole('button',{name:'Abrir menu'}).click();
  await mobile.keyboard.press('Escape');
  await mobile.getByRole('button',{name:'Abrir menu'}).click();
  await mobile.getByRole('navigation').getByRole('link',{name:'Churrasqueira'}).click();
  await mobile.getByRole('heading',{name:'Churrasqueira',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Navegador: dashboard, filtros da demonstração, CSV, operação, persistência e mobile aprovados.');
} catch (error) {
  if (debugPage) {
    await debugPage.screenshot({path:directory+'/falha.png'}).catch(()=>undefined);
    console.error(debugPage.url());
  }
  throw error;
} finally { await browser.close(); }
