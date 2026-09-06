"use client";
import {
    sfAlarmFill,
    sfArrowTrianglehead2ClockwiseRotate90,
    sfBattery100percent,
    sfBellFill,
    sfBlindsHorizontalClosed,
    sfBoltFill,
    sfCalendar,
    sfCameraFill,
    sfCloudFill,
    sfDoorLeftHandClosed,
    sfDropFill,
    sfFanFill,
    sfFigureWalkMotion,
    sfFlameFill,
    sfHifispeakerFill,
    sfHouseFill,
    sfHumidifierFill,
    sfLeafFill,
    sfLightbulbFill,
    sfLockFill,
    sfMagnifyingglass,
    sfMoonFill,
    sfPersonFill,
    sfPlayFill,
    sfPower,
    sfRoboticVacuumFill,
    sfSensorFill,
    sfSliderHorizontal3,
    sfSparkles,
    sfThermometerMedium,
    sfXmark,
} from "@bradleyhodges/sfsymbols";
import { SFIcon } from "@bradleyhodges/sfsymbols-react";

const icons = {
    light: sfLightbulbFill,
    switch: sfPower,
    input_boolean: sfPower,
    fan: sfFanFill,
    cover: sfBlindsHorizontalClosed,
    climate: sfThermometerMedium,
    humidifier: sfHumidifierFill,
    water_heater: sfFlameFill,
    media_player: sfHifispeakerFill,
    lock: sfLockFill,
    alarm_control_panel: sfLockFill,
    vacuum: sfRoboticVacuumFill,
    lawn_mower: sfLeafFill,
    valve: sfDropFill,
    siren: sfBellFill,
    remote: sfPlayFill,
    scene: sfMoonFill,
    script: sfBoltFill,
    button: sfPower,
    input_button: sfPower,
    automation: sfSparkles,
    sensor: sfSensorFill,
    binary_sensor: sfSensorFill,
    person: sfPersonFill,
    device_tracker: sfHouseFill,
    weather: sfCloudFill,
    camera: sfCameraFill,
    image: sfCameraFill,
    calendar: sfCalendar,
    timer: sfAlarmFill,
    event: sfBellFill,
    update: sfArrowTrianglehead2ClockwiseRotate90,
    home: sfHouseFill,
    search: sfMagnifyingglass,
    close: sfXmark,
    loading: sfArrowTrianglehead2ClockwiseRotate90,
};
const deviceClasses = {
    temperature: sfThermometerMedium,
    humidity: sfDropFill,
    moisture: sfDropFill,
    battery: sfBattery100percent,
    motion: sfFigureWalkMotion,
    occupancy: sfPersonFill,
    presence: sfPersonFill,
    door: sfDoorLeftHandClosed,
    window: sfBlindsHorizontalClosed,
    opening: sfDoorLeftHandClosed,
    power: sfBoltFill,
    energy: sfBoltFill,
    gas: sfFlameFill,
    smoke: sfFlameFill,
};
/** SF Symbols shared by accessory tiles, sheets and navigation. */
export function DeviceIcon({
    domain,
    className,
    deviceClass,
}: {
    domain: string;
    className?: string;
    deviceClass?: string;
}) {
    return (
        <SFIcon
            icon={
                ((domain === "sensor" || domain === "binary_sensor") &&
                deviceClass
                    ? deviceClasses[deviceClass as keyof typeof deviceClasses]
                    : undefined) ??
                icons[domain as keyof typeof icons] ??
                sfSliderHorizontal3
            }
            className={className}
            size={22}
            aria-hidden="true"
        />
    );
}
