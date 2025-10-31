import { Printer, PrinterInterfaceType, PrinterStatus } from '../types/entities/printer';
import LanClient from './LanClient';
import PrinterAdapter from './PrinterAdapter';

export default class MockLanClient extends LanClient {

    async pollingStatus(): Promise<PrinterStatus> {
        // Return a mocked status
        return 'IDLE';
    }

    async testConnection(): Promise<{ success: boolean; status: PrinterStatus; error?: Error }> {
        // Simulate a successful connection test

        // sleep
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
        return { success: true, status: 'IDLE' };
    }
}
