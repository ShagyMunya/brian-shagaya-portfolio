package com.nyazuramusika.app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;

public final class MarketRules {
    private MarketRules() {}
    public static long priceMinor(String value) {
        String text = value.trim();
        if (!text.matches("[0-9]+(?:\\.[0-9]{1,2})?")) throw new IllegalArgumentException("Enter a positive price with at most two decimal places.");
        BigDecimal price = new BigDecimal(text);
        long result = price.movePointRight(2).longValueExact();
        if (result <= 0 || result > 1_000_000_000L) throw new IllegalArgumentException("Enter a price between 0.01 and 10,000,000.");
        return result;
    }
    public static String priceText(long minor) { return BigDecimal.valueOf(minor,2).setScale(2,RoundingMode.UNNECESSARY).toPlainString(); }
    public static String price(long minor,String currency) { return currency + " " + String.format(Locale.US,"%,.2f",minor/100.0); }
    public static String whatsapp(String value) {
        String number=value.trim().replaceAll("[\\s()-]","");
        if (!number.startsWith("+")) number="+"+number;
        if (!number.matches("\\+[1-9][0-9]{7,14}")) throw new IllegalArgumentException("Use the country code, for example +263771234567.");
        return number;
    }
}
