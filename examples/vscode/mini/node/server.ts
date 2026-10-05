import * as net from 'net';
import { DEFAULT_PORT } from '../common/channels.js';

export function listenOn(port: number | string): net.Server {
	const server = net.createServer();
	server.listen(port);
	return server;
}

export function startServers(): void {
	listenOn(DEFAULT_PORT);
	listenOn(process.env.VSCODE_PORT);
}
