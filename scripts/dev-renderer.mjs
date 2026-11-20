import {loadConfigFromFile,createServer} from 'vite';
const loaded=await loadConfigFromFile({command:'serve',mode:'development'});
if(!loaded)throw new Error('Configuração Vite ausente.');
const config=loaded.config;
config.plugins=config.plugins.flat(Infinity).filter(plugin=>plugin&&!['vite-plugin-electron','vite-plugin-electron:dev','vite-plugin-electron:prod'].includes(plugin.name));
const server=await createServer({...config,configFile:false,server:{host:'127.0.0.1',port:5173,strictPort:true}});
await server.listen();console.log('Renderer de testes em http://127.0.0.1:5173');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
