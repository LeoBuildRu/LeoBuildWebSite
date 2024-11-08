from django.contrib import admin

# Register your models here.
from .models import *

admin.site.register(Company_Furniture)
admin.site.register(Furniture_Categorie)
admin.site.register(Product_Item)