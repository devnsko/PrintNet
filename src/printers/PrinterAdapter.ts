import { Printer, PrinterStatus } from "../types/entities/printer";

export default interface PrinterAdapter {
    pollingStatus(): Promise<PrinterStatus>;
    testConnection(): Promise<{ success: boolean; status: PrinterStatus; error?: Error }>;
}