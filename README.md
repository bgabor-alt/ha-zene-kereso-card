# Zene kereső kártya (Home Assistant)

Egyszerű keresőkártya Music Assistant lejátszókhoz: zene és rádió keresése gépelés közben,
találatok borítóképpel, koppintásra lejátszás a célpont lejátszón.

```yaml
type: custom:zene-kereso-card
target_sensor: sensor.zene_kereso_celpont   # entitás-azonosítót tartalmazó szenzor (media_player.*)
fallback: media_player.eloter_3
```
