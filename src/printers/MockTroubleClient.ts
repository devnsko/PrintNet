import { Printer } from "../types/entities/printer";
import PrinterAdapter from "../printers/PrinterAdapter";

export default class MockTroubleClient implements PrinterAdapter {
    private printer: Printer;
    // private apiKey: string;
    // private baseUrl: string;

    constructor(printer: Printer ) { // , apiKey: string, baseUrl: string
        this.printer = printer;
        // this.apiKey = apiKey;
        // this.baseUrl = baseUrl;
    }

    async pollingStatus(): Promise<Printer['status']> {
        // Implement polling logic to get the current status from OctoPrint API
        // For now, return a dummy status
        return 'ERROR';
    }

    async testConnection(): Promise<{ success: boolean; status: Printer['status']; error?: Error }> {
        // Implement connection test logic to OctoPrint API
        // For now, return a dummy success response
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        return { success: false, status: 'ERROR', error: new Error('Simulated connection failure') };
    }
}