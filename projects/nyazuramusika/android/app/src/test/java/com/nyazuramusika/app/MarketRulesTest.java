package com.nyazuramusika.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class MarketRulesTest {
    @Test public void pricesKeepExactCents(){assertEquals(1,MarketRules.priceMinor("0.01"));assertEquals(1999,MarketRules.priceMinor("19.99"));assertEquals("19.99",MarketRules.priceText(1999));}
    @Test public void invalidPricesCannotBecomeListings(){for(String value:new String[]{"0","-1","1.234","NaN","1e3","10,000","10000000.01",""}){try{MarketRules.priceMinor(value);fail(value);}catch(IllegalArgumentException|ArithmeticException expected){}}}
    @Test public void contactNumbersUseAnInternationalFormat(){assertEquals("+263771234567",MarketRules.whatsapp("+263 77 123 4567"));assertEquals("+263771234567",MarketRules.whatsapp("263771234567"));}
    @Test public void malformedPhoneNumbersCannotOpenWhatsapp(){for(String value:new String[]{"0771234567","+00000123","abc","+263<script>"}){try{MarketRules.whatsapp(value);fail(value);}catch(IllegalArgumentException expected){}}}
}
