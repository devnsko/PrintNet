// src/types/entities/printer.ts

export type PrinterInterfaceType = 'LAN' | 'OCTOPRINT';
export type PrinterStatus =
    | 'IDLE'
    | 'READY'
    | 'PRINTING'
    | 'ERROR'
    | 'OFFLINE'
    | 'DISCONNECTED';

export interface Printer {
    id: string; // UUID
    name: string | null;
    model: string | null;
    interface: PrinterInterfaceType;
    status: PrinterStatus;
    is_active: boolean;
    current_job_id: string | null;
    queue_id: string | null;
    last_updated: Date;
}