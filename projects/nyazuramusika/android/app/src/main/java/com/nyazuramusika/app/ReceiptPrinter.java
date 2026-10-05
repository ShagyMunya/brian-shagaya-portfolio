package com.nyazuramusika.app;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import org.json.JSONObject;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class ReceiptPrinter {
    static void print(Activity activity,JSONObject record) {
        if(!"seller_confirmed".equals(record.optString("payment_state")))throw new IllegalArgumentException("The seller must confirm receiving the payment first.");
        PrintManager manager=(PrintManager)activity.getSystemService(Activity.PRINT_SERVICE);
        manager.print("NyazuraMusika payment record",new PrintDocumentAdapter(){
            @Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,CancellationSignal cancellation,LayoutResultCallback callback,Bundle extras){
                if(cancellation.isCanceled()){callback.onLayoutCancelled();return;}
                callback.onLayoutFinished(new PrintDocumentInfo.Builder("NyazuraMusika-receipt.pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(1).build(),true);
            }
            @Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,CancellationSignal cancellation,WriteResultCallback callback){
                if(cancellation.isCanceled()){callback.onWriteCancelled();return;}
                try(PdfDocument pdf=new PdfDocument()){
                    PdfDocument.Page page=pdf.startPage(new PdfDocument.PageInfo.Builder(595,842,1).create());Canvas canvas=page.getCanvas();Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.rgb(20,39,56));paint.setTypeface(Typeface.create(Typeface.DEFAULT,Typeface.BOLD));paint.setTextSize(26);canvas.drawText("NyazuraMusika",36,55,paint);
                    paint.setTextSize(18);canvas.drawText("Seller-confirmed payment record",36,90,paint);paint.setTypeface(Typeface.DEFAULT);paint.setTextSize(13);
                    String time=new SimpleDateFormat("dd MMM yyyy HH:mm z",Locale.getDefault()).format(new Date(record.optLong("confirmed_at")));
                    String[] rows={"Receipt: "+record.optString("receipt_number"),"Confirmed: "+time,"Item: "+record.optString("title"),"Amount: "+MarketRules.price(record.optLong("price_minor"),record.optString("currency")),"Buyer: "+record.optString("buyer_name"),"Seller: "+record.optString("seller_name"),"EcoCash recipient: "+record.optString("payee_phone"),"EcoCash reference: "+record.optString("payment_reference"),"Method: EcoCash direct transfer","Purchase ID: "+record.optString("id"),"","Confirmed by the seller; not independently verified by EcoCash.","NyazuraMusika did not transfer or hold the funds.","Keep your original EcoCash transaction confirmation."};
                    float y=125;for(String row:rows){String remaining=row.replace('\n',' ').replace('\r',' ');if(remaining.isEmpty()){y+=20;continue;}while(!remaining.isEmpty()){int count=paint.breakText(remaining,true,523,null);if(count<1)break;canvas.drawText(remaining.substring(0,count),36,y,paint);remaining=remaining.substring(count);y+=20;}y+=7;}
                    pdf.finishPage(page);if(cancellation.isCanceled()){callback.onWriteCancelled();return;}try(FileOutputStream output=new FileOutputStream(destination.getFileDescriptor())){pdf.writeTo(output);}callback.onWriteFinished(new PageRange[]{new PageRange(0,0)});
                }catch(Exception error){callback.onWriteFailed("The receipt could not be printed. Please try again.");}
            }
        },new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_COLOR).build());
    }
}
