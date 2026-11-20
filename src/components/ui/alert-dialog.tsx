// Confirmation surface composed from the project's existing shadcn/Radix Dialog.
import {forwardRef,type ComponentPropsWithoutRef,type ElementRef} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './dialog';
export const AlertDialog=Dialog;
export const AlertDialogTitle=DialogTitle;
export const AlertDialogDescription=DialogDescription;
export const AlertDialogContent=forwardRef<ElementRef<typeof DialogContent>,ComponentPropsWithoutRef<typeof DialogContent>>((props,ref)=><DialogContent {...props} ref={ref} role="alertdialog" onOpenAutoFocus={event=>{event.preventDefault();setTimeout(()=>{const content=document.querySelector('[role="alertdialog"]');(content?.querySelector('[data-alert-cancel]') as HTMLElement|null)?.focus();},0);}} />);
AlertDialogContent.displayName='AlertDialogContent';
