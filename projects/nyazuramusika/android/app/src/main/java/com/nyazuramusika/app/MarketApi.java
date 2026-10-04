package com.nyazuramusika.app;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class MarketApi {
    static class ApiException extends Exception {
        final int status;
        ApiException(int status,String message) { super(message);this.status=status; }
    }
    private static byte[] read(InputStream input,int limit) throws Exception {
        if(input==null)return new byte[0];
        try(input; ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int count;
            while((count=input.read(buffer))!=-1) {
                if(output.size()+count>limit)throw new ApiException(413,"The response is too large. Please try a smaller photo.");
                output.write(buffer,0,count);
            }
            return output.toByteArray();
        }
    }
    private static byte[] request(String path,String method,byte[] body,String contentType,String token,int limit) throws Exception {
        if(!path.startsWith("/api/"))throw new IllegalArgumentException("Invalid API path");
        HttpURLConnection connection=(HttpURLConnection)new URL(BuildConfig.MARKET_API_ORIGIN+path).openConnection();
        try {
            connection.setConnectTimeout(15_000);connection.setReadTimeout(20_000);
            connection.setInstanceFollowRedirects(false);connection.setRequestMethod(method);
            connection.setRequestProperty("Accept","application/json");
            if(token!=null&&!token.isEmpty())connection.setRequestProperty("Authorization","Bearer "+token);
            if(body!=null) {
                connection.setDoOutput(true);connection.setRequestProperty("Content-Type",contentType);
                connection.setFixedLengthStreamingMode(body.length);
                try(var stream=connection.getOutputStream()) { stream.write(body); }
            }
            int status=connection.getResponseCode();
            if(status<200||status>=300) {
                String message=status==401?"Your session has expired. Please sign in again.":"The marketplace is unavailable. Please try again.";
                try { message=new JSONObject(new String(read(connection.getErrorStream(),64_000),StandardCharsets.UTF_8)).optString("error",message); }catch(Exception ignored){}
                throw new ApiException(status,message);
            }
            return read(connection.getInputStream(),limit);
        } finally { connection.disconnect(); }
    }
    static JSONObject call(String path,String method,JSONObject body,String token) throws Exception {
        byte[] bytes=body==null?null:body.toString().getBytes(StandardCharsets.UTF_8);
        return new JSONObject(new String(request(path,method,bytes,"application/json",token,1_000_000),StandardCharsets.UTF_8));
    }
    static String upload(byte[] jpeg,String token) throws Exception {
        return new JSONObject(new String(request("/api/images","POST",jpeg,"image/jpeg",token,64_000),StandardCharsets.UTF_8)).getString("image_id");
    }
    static byte[] photo(String path) throws Exception { return request(path,"GET",null,null,null,800_000); }
}
